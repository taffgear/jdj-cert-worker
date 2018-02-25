const path          = require('path');
const fs            = require('fs');
const bb            = require('bluebird');
const Redis         = require('ioredis');
const chokidar      = require('chokidar');
const rp            = require('request-promise');
const each 					= require('lodash/each');
const reduce        = require('lodash/reduce');
const find          = require('lodash/find');
const pdfText       = require('pdf-text');
const moment        = require('moment');
const nconf         = require('nconf');
const fsPath        = require('fs-path');
const csv           = require('csvtojson');
const wkhtmltopdf   = require('wkhtmltopdf');

// TODO: run sudo apt-get install xvfb libfontconfig wkhtmltopdf on server!!!

const pending       = [];
const cnf           = nconf.argv().env().file({ file: path.resolve(__dirname + '/config.json') });
const watchDir      = cnf.get('watchdir') || '/home/markhorsman/jdj-certificates/';
const genHTML       = require('./lib/genPDFHTMLString');

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
        redis   : new Redis()
    }).tap(insts => {
        insts.pdfWatcher  = initPDFWatcher(insts);
        insts.csvWacher   = initCSVWatcher(insts);
        return insts;
    });
}

function run() {
  console.log('JDJ Certificate Worker running...');
}

function buildRedisKey(category) {
  return "jdj:logs:" + category + ":" + moment().unix();
}

function initPDFWatcher(insts) {
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
            .then(obj => {
              const body = genUpdateStockItemBody(obj.pdfData.lastser, obj.pdfData.serno, obj.stockItem.STATUS, obj.pdfData.itemno);

              return updateStockItem(body)
                .then(resp => ({ stockItem: obj.stockItem, pdfData: obj.pdfData, resp }))
              ;
            })
            .then(copyPDFToFolder)
            .then(obj => {
              const body = genCreateContDocBody(obj.pdfData.itemno, obj.pdfData.filename, obj.pdfData.lastser);

              return createContdoc(body)
                .then(resp => ({ stockItem: obj.stockItem, pdfData: obj.pdfData, resp }))
              ;
            })
            .then(result => {
              watcher.unwatch(path);

              const logMsg = JSON.stringify({ msg: "Certificaat " + path.split('/').pop() + " succesvol gekoppeld aan artikel " + result.pdfData.itemno, ts: moment().unix()});

              insts.redis.set(buildRedisKey("success"), logMsg);
              console.log(result);
            })
            .catch(e => {
              insts.redis.set(buildRedisKey("failed"), JSON.stringify({ msg: e.message, ts: moment().unix() }));
              console.log(e);
              fs.unlinkSync(path);

            })
            .finally(() => pending.splice(pending.indexOf(path), 1))
          ;
      });
  });

  return watcher;
}

function initCSVWatcher(insts) {
  const watcher = chokidar.watch(watchDir + '.', {
      persistent: true,
      ignored: function (path, stat) {
          if (!stat) return false;

          if (path[path.length - 1] === '/')  // don't ignore dirs
              return true;

          return /.*[^.csv]$/.test(path);
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

          getJSONFromCSV(path)
          .then(prepCSVObjects)
          .then(data => {
            return findStockItems(data.map(o => o.articleNumber))
              .then(stockItems => mapCSVObjectsToStockItems(data, stockItems))
              .then(mapped => {
                  return bb.map(mapped, (obj) => {
                      const serno = (obj.PATSerialnumber.length ? obj.PATSerialnumber : obj['SERNO'])
                      const body = genUpdateStockItemBody(obj.testDate, serno, obj.STATUS, obj.ITEMNO);

                      return updateStockItem(body)
                        .then(resp => genPDF(obj))
                        .then(filePath => {
                          const contDocBody = genCreateContDocBody(obj.ITEMNO, filePath, obj.testDate);

                          return createContdoc(contDocBody).then(resp => filePath);
                        })
                        .then(filePath => {
                          const logMsg = JSON.stringify({ msg: "Certificaat " + filePath.split('/').pop() + " succesvol gekoppeld aan artikel " + obj.ITEMNO, ts: moment().unix()});

                          return insts.redis.set(buildRedisKey("success"), logMsg);
                        })
                        .catch(e => {
                          console.log(e);
                          return insts.redis.set(buildRedisKey("failed"), JSON.stringify({ msg: e.message, ts: moment().unix() }));
                        })
                      ;
                  }, { concurrency : 1 }).then(results => {
                      console.log(results);
                      watcher.unwatch(path);
                  });
              })
          });
      });
  });

  return watcher;
}

function genPDF(obj)
{
  return new bb((resolve, reject) => {
    const filePath  = cnf.get('pdfDir') + obj.PGROUP + '/' + obj.GRPCODE;
    const fileName  = filePath + '/' + obj.ITEMNO + '.pdf';
    const html      = genHTML(obj);

    fsPath.mkdir(filePath, err => {
      if (err) return reject(err);

      wkhtmltopdf(html, { output: fileName }, (err) => resolve(fileName));
    });
  });
}

function genUpdateStockItemBody(lastser, serno, status, itemno)
{
  return {
    lastser: lastser,
    period: 365,
    serno: serno,
    status: (parseInt(status) === 11 ? 0 : status),
    pattest: 1,
    patlastser: lastser,
    patperiod: 365,
    patpertype: 1,
    itemno: itemno
  };
}

function genCreateContDocBody(itemno, filePath, lastser)
{
  return {
    type: 'ST',
    key: itemno,
    filename: filePath,
    optflag: 0,
    options: 0,
    sid: lastser,
    scantopdftype: 0,
    name: 'Certificaat ' + moment(lastser).format('YYYY'),
    showinweb: 0
  };
}

function mapCSVObjectsToStockItems(objects, stockItems)
{
  if (!stockItems || !stockItems.length) return [];

  return reduce(objects, (acc, obj) => {
    const stockItem = find(stockItems, { 'ITEMNO' : obj.articleNumber });

    if (!stockItem) return acc;

    const testDate = moment(obj.testDate);
    const lastser = moment(stockItem['LASTSER#1']);

    if (lastser.isValid() && moment(lastser.format('YYYY-MM-DD')).isSameOrAfter(moment(testDate).format('YYYY-MM-DD')))
      return acc;

    acc.push(Object.assign(obj, stockItem));

    return acc;
  }, []);
}

function prepCSVObjects(data)
{
  return reduce(data, (acc, obj) => {
    if (!obj.articleNumber || !obj.articleNumber.length)
      return acc;

    if (!obj.testDate || !obj.testDate.length)
      return acc;

    const m = moment(obj.testDate);

    if (!m.isValid()) return acc;

    const t = (obj.testTime && obj.testTime.length ? moment(obj.testTime, ['h:m:a', 'H:m']) : moment());

    obj.testDate = m.format('YYYY-MM-DD') + ' ' + t.format('HH:mm:ss.SSS')

    acc.push(obj);
    return acc;
  }, []);
}

function getJSONFromCSV(path)
{
  return new bb((resolve, reject) => {
    const data = [];

    csv()
    .fromFile(path)
    .on('json',(jsonObj)=>{
        data.push(jsonObj);
    })
    .on('done',(error)=>{
        resolve(data);
    });
  });
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

function findStockItems(itemNumbers)
{
  return rp(
    {
      uri: cnf.get('api:uri') + '/stock/findin',
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      body: { itemNumbers },
      json: true
    }
  ).then(resp => resp.body);
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

function updateStockItem(body)
{
  return rp(
    {
      method: 'PUT',
      uri: cnf.get('api:uri') + '/stock',
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      body,
      json: true
    }
  );
}

function createContdoc(body)
{
  return rp(
    {
      method: 'POST',
      uri: cnf.get('api:uri') + '/contdoc',
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      body,
      json: true
    }
  );
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
