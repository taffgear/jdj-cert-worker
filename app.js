const path          = require('path');
const fs            = require('fs');
const bb            = require('bluebird');
const chokidar      = require('chokidar');
const rp            = require('request-promise');
const each 					= require('lodash/each');
const pdfText       = require('pdf-text');
const moment        = require('moment');
const nconf         = require('nconf');
const fsPath        = require('fs-path');


const pending       = [];
const cnf           = nconf.argv().env().file({ file: path.resolve(__dirname + '/config.json') });
const watchDir      = cnf.get('watchdir') || '/home/markhorsman/jdj-certificates/';

getInsts()
  .then(run)
  .catch(e => { console.log(e); process.exit(); })
;

/**
 * resolves to a collection of require [resource] instances
 *
 * @return {Promise}
 */
function getInsts()
{
    console.log('initializing resources ... ');

    return bb.props({
        watcher: initWatcher()
    });
}

function run() {
  console.log('JDJ Certificate Worker running...');
}

function initWatcher() {
  const watcher = chokidar.watch(watchDir + '.', {
      persistent: true,
      ignored: function (path, stat) {
          if (!stat) return false;

          if (path[path.length - 1] === '/')  // don't ignore dirs
              return true;

          return /.*[^.pdf]$/.test(path);
      },
      ignoreInitial: true,
      followSymlinks: false,
      alwaysStat: false,
      depth: 0,
      ignorePermissionErrors: false,
      atomic: true,
      awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100
      }
  });

  watcher.on('error', (e) => {
      console.log('Watcher Error: ' + e.message); // what to do?
  });

  watcher.on('ready', () => {
      watcher.on('add', (path) => {
          pending.push(path);

          genStockItemFromPDF(path)
            .then(findContdocItem)
            .then(obj => {
                if (obj.resp.body) {
                  const m = moment(obj.resp.body.SID);
                  if (m.isValid() && moment(m.format('YYYY-MM-DD')).isSameOrAfter(moment(obj.stockItem.lastser).format('YYYY-MM-DD')))
                    throw new Error('Certificate file ' + path + ' already processed');
                }

                return obj.stockItem;
            })
            .then(findStockItem)
            .then(updateStockItem)
            .then(copyPDFToFolder)
            .then(createContdoc)
            .then(result => {
              watcher.unwatch(path);

              console.log(result);
            })
            .catch(e => {
              console.log(e);
              fs.unlinkSync(path);

            })
            .finally(() => pending.splice(pending.indexOf(path), 1))
          ;
      });
  });

  return watcher;
}

function copyPDFToFolder(obj)
{
    const filePath = cnf.get('pdfDir') + obj.stockItem.PGROUP + '/' + obj.stockItem.GRPCODE;
    obj.pdfData.filename = filePath + '/' + obj.stockItem.ITEMNO + '.pdf';

    return new bb((resolve, reject) => {
      fsPath.mkdir(filePath, function(err) {
        if (err) return reject(err);

        fsPath.copy(obj.pdfData.path, obj.pdfData.filename, function(err) {
          if (err) return reject(err);

          return resolve(obj);
        });
      });

    });
}

function findStockItem(stockItem)
{
  return rp(
    {
      uri: cnf.get('api:uri') + '/stock/find/' + stockItem.itemno,
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      json: true
    }
  ).then(resp => ({ stockItem: resp.body, pdfData: stockItem }));
}

function findContdocItem(stockItem)
{
  return rp(
    {
      uri: cnf.get('api:uri') + '/contdoc/find/' + stockItem.itemno,
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      json: true
    }
  ).then(resp => ({ resp, stockItem }));
}

function updateStockItem(obj)
{
  return rp(
    {
      method: 'PUT',
      uri: cnf.get('api:uri') + '/stock',
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      body: {
        lastser: obj.pdfData.lastser,
        period: 365,
        serno: obj.pdfData.serno,
        status: (parseInt(obj.stockItem.STATUS) === 11 ? 0 : obj.stockItem.STATUS),
        pattest: 1,
        patperiod: 365,
        patlastser: obj.pdfData.lastser,
        patpertype: 1,
        itemno: obj.pdfData.itemno
      },
      json: true
    }
  ).then(resp => ({ stockItem: obj.stockItem, pdfData: obj.pdfData, resp }));
}

function createContdoc(obj)
{
  return rp(
    {
      method: 'POST',
      uri: cnf.get('api:uri') + '/contdoc',
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      body: {
        type: 'ST',
        key: obj.pdfData.itemno,
        filename: obj.pdfData.filename,
        optflag: 0,
        options: 0,
        sid: obj.pdfData.lastser,
        scantopdftype: 0,
        name: 'Certificaat ' + moment().format('YYYY'),
        showinweb: 0
      },
      json: true
    }
  ).then(resp => ({ stockItem: obj.stockItem, pdfData: obj.pdfData, resp }));
}

function genStockItemFromPDF(path) {
  return new bb((resolve, reject) => {
    pdfText(path, function(err, chunks) {
      if (!chunks)
        return reject(new Error('Could not read contents of file: ' + file));

      const stockItem = {};

      return extractArticleNumber(chunks, path)
        .then(articleNumber => {
          stockItem.itemno  = articleNumber;
          stockItem.serno   = extractSerialNumber(chunks);
          stockItem.lastser = extractDate(chunks);
          stockItem.path    = path;
          resolve(stockItem)
      })
      .catch(e => reject(e));
    });
  });
}

function extractArticleNumber(chunks, path)
{
  return new bb((resolve, reject) => {
    const multipleErr = new Error('Multiple certificates found in one file.');

    // are there more pages with an article number?
    const fileHasMultipleMatches = (str, index) => {
      if (chunks.indexOf(str, index) > -1)
          return true;

      return false;
    }

    const identificationNumberIndex = chunks.indexOf('Identification number');
    const artikelnummerIndex        = chunks.indexOf('Artikelnummer:');
    const distinguishingNumberIndex = chunks.indexOf('(Distinguishing nr)');

    if (identificationNumberIndex > -1) {
      if (fileHasMultipleMatches('Identification number', identificationNumberIndex + 3))
        return reject(multipleErr);

      return resolve(chunks[identificationNumberIndex + 2]);
    }

    if (artikelnummerIndex > -1) {
      if (fileHasMultipleMatches('Artikelnummer:', artikelnummerIndex + 2))
        return reject(multipleErr);

      return resolve(chunks[artikelnummerIndex + 1]);
    }

    if (distinguishingNumberIndex > -1) {
        if (fileHasMultipleMatches('(Distinguishing nr)', distinguishingNumberIndex + 2))
          return reject(multipleErr);

        return resolve(chunks[distinguishingNumberIndex + 1]);
    }

    return reject('No articleNumber found in file ' + path);
  });
}

function extractDate(chunks) {
  const datumIndex              = chunks.indexOf('Datum:');
  const dateOfCalibrationIndex  = chunks.indexOf('Date of calibration');
  const dateOf1stTestIndex      = chunks.indexOf('(Date of 1st test)');
  const time                    = moment().format('HH:mm:ss.SSS');

  if (datumIndex > -1) {
    const m = moment(chunks[datumIndex + 1], 'DD-MM-YYYY');

    if (m.isValid()) return m.format('YYYY-MM-DD') + ' ' + time;
  }

  if (dateOfCalibrationIndex > -1) {
     const m = moment(chunks[dateOfCalibrationIndex + 2], 'DD MMMM YYYY');

     if (m.isValid()) return m.format('YYYY-MM-DD') + ' ' + time;
  }

  if (dateOf1stTestIndex > -1) {
    const m = moment(chunks[dateOf1stTestIndex + 1], 'DD-MM-YYYY');

    if (m.isValid()) return m.format('YYYY-MM-DD') + ' ' + time;
  }

  return moment().format('YYYY-MM-DD HH:mm:ss');
}

function extractSerialNumber(chunks)
{
  const serienummerIndex      = chunks.indexOf('Serienummer:');
  const serialNumberIndex     = chunks.indexOf('Serial number');
  const traceabilityCodeIndex = chunks.indexOf('(Traceability code)');

  if (serienummerIndex > -1) {
    const serialNumber = chunks[serienummerIndex + 1];

    if (serialNumber !== 'Betreffende het onderzoek van een:')
      return serialNumber;
  }

  if (serialNumberIndex > -1) {
    const serialNumber = chunks[serialNumberIndex + 1];

    if (serialNumber !== ': ')
      return serialNumber;
  }

  if (traceabilityCodeIndex > -1)
    return chunks[traceabilityCodeIndex + 1];

  return null;
}
