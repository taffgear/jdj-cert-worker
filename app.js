const path          = require('path');
const fs            = require('fs');
const bb            = require('bluebird');
const Redis         = require('ioredis');
const chokidar      = require('chokidar');
const io            = require('socket.io')();
const rp            = require('request-promise');
const each 					= require('lodash/each');
const reduce        = require('lodash/reduce');
const find          = require('lodash/find');
const get           = require('lodash/get');
const omit          = require('lodash/omit');
const uniq          = require('lodash/uniq');
const pdfText       = require('pdf-text');
const moment        = require('moment');
const nconf         = require('nconf');
const fsPath        = require('fs-path');
const csv           = require('csvtojson');
const wkhtmltopdf   = require('wkhtmltopdf');
const uuid          = require('uuid/v4');

// TODO: run sudo apt-get install xvfb libfontconfig wkhtmltopdf on server!!!

const pending       = [];
const cnf           = nconf.argv().env().file({ file: path.resolve(__dirname + '/config.json') });
const genHTML       = require('./lib/genPDFHTMLString');

const discardNonStockItemProps = [
  'testDate',
  'testTime',
  'testedWith',
  'customerName',
  'customerAddress1',
  'customerAddress2',
  'customerAddress3',
  'customerAddress4',
  'customerPostcode',
  'PATModel',
  'PATSerialnumber',
  'articleNumber',
  'articleSerialnumber',
  'articleDescription',
  'testStatus',
  'testGroup',
  'testGroupVoltage',
  'testGroupDescription',
  'testGroupStatus',
  'test1',
  'test2',
  'test3',
  'test4',
  'test5',
  'test6',
  'test7',
  'test8'
];

getInsts()
  .then(setup)
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
        redis   : new Redis(),
        clients : [],
        watchDir: cnf.get('watchdir')
    }).tap(insts => {
        return insts.redis.get('jdj:settings').then(result => {
          insts.settings = updateSettings(insts, (result ? JSON.parse(result) : {}));

          insts.pdfWatcher  = initPDFWatcher(insts);
          insts.csvWacher   = initCSVWatcher(insts);

          return insts;
        });
    });
}

function updateSettings(insts, settings) {
  if (get(settings, 'fixed_date') && moment(settings.fixed_date).isValid())
      settings.fixed_date = moment(settings.fixed_date + ' ' +  moment().format('HH:mm:ss.SSS')).format('YYYY-MM-DD HH:mm:ss.SSS');
  else
    settings.fixed_date = null;

  const dir       = get(settings, 'watch_dir');
  const sWatchDir = (dir && dir.length && dir.substr(-1) !== '/' ? dir + '/' : dir) ;

  if (sWatchDir && fs.existsSync(sWatchDir) && insts.watchDir !== sWatchDir) {
    insts.watchDir = sWatchDir;

    if (insts.pdfWatcher) {
      insts.pdfWatcher.close();
      insts.csvWacher.close();

      insts.pdfWatcher  = initPDFWatcher(insts);
      insts.csvWacher   = initCSVWatcher(insts);
    }
  }

  insts.settings = settings;

  return settings;
}

function setup(insts) {
  io.on('connection', client => {
    insts.clients.push(client);

    client.on('settings', settings => {
      updateSettings(insts, settings);
    });

    client.on('disconnect', () => {
      insts.clients.splice(insts.clients.indexOf(client), 1);
    });
  });

  return insts;
}

function run(insts) {
  console.log('JDJ Certificate Worker running...');

  const port = cnf.get('server:port') || 8000;
  io.listen(port);
  console.log('socket.io server listening on port %s', port);
}

function buildRedisKey(id, category) {
  return "jdj:logs:" + category + ":" + id;
}

function notifyClients(type, msg) {
  this.clients.forEach(client => {
    client.emit(type, msg);
  });
}

function initPDFWatcher(insts) {
  const watcher = chokidar.watch(insts.watchDir + '.', {
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
      usePolling: true,
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

          getStockItemFromPDF(path)
            .then(findContdocItem)
            .then(obj => {
                if (obj.resp.body) {
                  const m = moment(obj.resp.body.SID);
                  if (m.isValid() && moment(m.format('YYYY-MM-DD')).isSameOrAfter(moment(obj.stockItem.lastser).format('YYYY-MM-DD')))
                    throw new Error('PDF ' + path + ' is al verwerkt.');
                }

                if (get(insts.settings, 'fixed_date'))
                    obj.stockItem['LASTSER#1'] = insts.settings.fixed_date;

                return obj.stockItem;
            })
            .then(stockItem => {
              const body = genUpdateStockItemBody(stockItem['LASTSER#1'], stockItem.SERNO, stockItem.STATUS, stockItem.ITEMNO);

              return updateStockItem(body)
                .then(resp => ({ stockItem, resp }))
              ;
            })
            .then(copyPDFToFolder)
            .then(obj => {
              const body = genCreateContDocBody(obj.stockItem.ITEMNO, obj.filename, obj.stockItem['LASTSER#1']);

              return createContdoc(body)
                .then(resp => ({ stockItem: obj.stockItem, resp }))
              ;
            })
            .then(result => {
              const logMsg = { msg: "Certificaat " + path.split('/').pop() + " succesvol gekoppeld aan artikel " + result.stockItem.ITEMNO, ts: moment().format('x'), id: uuid()};

              insts.redis.set(buildRedisKey(logMsg.id, "success"), JSON.stringify(logMsg));
              notifyClients.call(insts, 'stockItem', omit(result.stockItem, ['filename', 'path']));
              notifyClients.call(insts, 'log', logMsg);
            })
            .catch(e => {
              const logMsg = { msg: e.message, ts: moment().format('x'), id: uuid() };

              insts.redis.set(buildRedisKey(logMsg.id, "failed"), JSON.stringify(logMsg));
              notifyClients.call(insts, 'log', logMsg);
            })
            .finally(() => {
              pending.splice(pending.indexOf(path), 1);
              // watcher.unwatch(path);
            })
          ;
      });
  });

  return watcher;
}

function initCSVWatcher(insts) {
  const watcher = chokidar.watch(insts.watchDir + '.', {
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
      usePolling: true,
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
          .then(data => prepCSVObjects.call(insts, data))
          .then(data => {
            return findStockItems(uniq(data.map(o => o.articleNumber)))
              .then(stockItems => mapCSVObjectsToStockItems(data, stockItems))
              .then(mapped => {
                  return bb.map(mapped, obj => {
                      const serno = (obj.PATSerialnumber.length ? obj.PATSerialnumber : obj['SERNO']);
                      const body  = genUpdateStockItemBody(obj.testDate, serno, obj.STATUS, obj.ITEMNO);

                      return updateStockItem(body)
                        .then(resp => genPDF(obj))
                        .then(filePath => {
                          const contDocBody = genCreateContDocBody(obj.ITEMNO, filePath, obj.testDate);

                          return createContdoc(contDocBody).then(resp => filePath);
                        })
                        .then(filePath => {

                          const logMsg = { msg: "Certificaat " + filePath.split('/').pop() + " succesvol gekoppeld aan artikel " + obj.ITEMNO, ts: moment().format('x'), id: uuid()};

                          obj['LASTSER#1'] = obj.testDate;prepCSVObjects

                          notifyClients.call(insts, 'stockItem', omit(obj, discardNonStockItemProps));
                          notifyClients.call(insts, 'log', logMsg);

                          return insts.redis.set(buildRedisKey(logMsg.id, "success"), JSON.stringify(logMsg));
                        })
                        .catch(e => {
                          const logMsg = { msg: e.message, ts: moment().format('x'), id: uuid() };
                          notifyClients.call(insts, 'log', logMsg);

                          return insts.redis.set(buildRedisKey(logMsg.id, "failed"), JSON.stringify(logMsg));
                        })
                      ;
                  }, { concurrency : 1 }).then(results => {
                      // watcher.unwatch(path);
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
    obj.testDate = moment(obj.testDate).format('DD-MM-YYYY');
    obj.testTime = moment(obj.testTime, ['h:m:a', 'H:m']).format('HH:mm:ss');

    const filePath  = cnf.get('pdfDir') + obj.PGROUP + '/' + obj.GRPCODE;
    const fileName  = filePath + '/' + obj.ITEMNO + '.pdf';
    const html      = genHTML(obj);

    fsPath.mkdir(filePath, err => {
      if (err) return reject(err);

      wkhtmltopdf(html, { output: fileName, dpi: 300 }, (err) => resolve(fileName));
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

  return reduce(stockItems, (acc, stockItem) => {
    const obj = find(objects, { 'articleNumber' : stockItem.ITEMNO });

    if (!obj) return acc;

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
  const prepped =  reduce(data, (acc, obj) => {
    if (!obj.articleNumber || !obj.articleNumber.length)
      return acc;

    if (get(this.settings, 'fixed_date')) {
      obj.testDate = this.settings.fixed_date;

      acc.push(obj);
      return acc;
    }

    if (!obj.testDate || !obj.testDate.length)
      return acc;

    const m = moment(obj.testDate);

    if (!m.isValid()) return acc;

    const t = (obj.testTime && obj.testTime.length ? moment(obj.testTime, ['h:m:a', 'H:m']) : moment());

    obj.testDate = m.format('YYYY-MM-DD') + ' ' + t.format('HH:mm:ss.SSS')

    acc.push(obj);
    return acc;
  }, []);

  return prepped.sort(function (a, b) {
    const date1 = new Date(a.testDate);
    const date2 = new Date(b.testDate);

    return date1 - date2;
  });
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
    obj.filename = filePath + '/' + obj.stockItem.ITEMNO + '.pdf';

    return new bb((resolve, reject) => {
      fsPath.mkdir(filePath, function(err) {
        if (err) return reject(err);

        fsPath.copy(obj.stockItem.path, obj.filename, err => {
          if (err) return reject(err);

          return resolve(obj);
        });
      });

    });
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
      uri: cnf.get('api:uri') + '/contdoc/find/' + stockItem.ITEMNO,
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

function getStockItemFromPDF(path) {
  return new bb((resolve, reject) => {
    pdfText(path, (err, chunks) => {
      if (!chunks)
        return reject(new Error('Could not read contents of file: ' + path));

      return findStockItem(chunks, path)
        .then(stockItem => {
          stockItem.SERNO         = extractSerialNumber(chunks);
          stockItem['LASTSER#1']  = extractDate(chunks);
          stockItem.path          = path;

          resolve(stockItem)
      })
      .catch(e => reject(e));
    });
  });
}

function findStockItem(chunks, path)
{
  const re = /^([a-zA-Z0-9]){3,20}$/;
  const matches = [];

    chunks.forEach(str => {
      let a = null;

      a = re.exec(str);
      if (!a) return;

      matches.push(a[0]);
    });

    return findStockItems(matches).then(results => {
      if (!results.length)
        throw new Error('Geen artikel gevonden voor PDF: ' + path);

      if (results.length > 1)
          throw new Error('Meerdere artikelen gevonden voor PDF: ' + path);

      return results[0];
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
