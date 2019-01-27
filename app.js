const path          = require('path');
const fs            = require('fs');
const bb            = require('bluebird');
const Redis         = require('ioredis');
const chokidar      = require('chokidar');
const io            = require('socket.io')();
const rp            = require('request-promise');
const nodemailer    = require('nodemailer');
const reduce        = require('lodash/reduce');
const find          = require('lodash/find');
const get           = require('lodash/get');
const omit          = require('lodash/omit');
const uniq          = require('lodash/uniq');
const isEmpty       = require('lodash/isEmpty');
const pdfText       = require('pdf-text');
const moment        = require('moment');
const nconf         = require('nconf');
const fsPath        = require('fs-path');
const csv           = require('csvtojson');
const wkhtmltopdf   = require('wkhtmltopdf');
const uuid          = require('uuid/v4');
const Xvfb          = require('xvfb');
const xvfb          = new Xvfb();
const ocr           = require('ocr');
const pdf2img       = require('pdf2img');

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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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

          insts.stockChangesInterval = setInterval(() => {
            stockChanges.call(insts);
          }, 60 * 1000);

          insts.stockChangesInterval.unref();

          return insts;
        });
    });
}

function buildStockStatusUpdateKey(id, date)
{
  return "jdj:stock_updates:" + id + ":" + date;
}

function stockChanges()
{
  return getStockStatusUpdates.call(this, moment().format('YYYY-MM-DD'))
    .then(results => bb.map(results, record => {
          return this.redis.exists(buildStockStatusUpdateKey(record.ITEMNO, record['DOCDATE#2']))
            .then(exists => {
              if (exists) return false;
              if (!record.FILENAME.length) return false;

              const filePath  = cnf.get('pdfDir') + record.PGROUP + '/' + record.GRPCODE + '/' + record.ITEMNO + '.pdf';

              if (!fs.existsSync(filePath)) return {};

              return this.redis.set(buildStockStatusUpdateKey(record.ITEMNO, record['DOCDATE#2']), true)
                .then(result => ({ itemno: record.ITEMNO, filePath }))
              ;
            })
          ;
      }, { concurrency : 1 })
      .then(results => {
        const articles = reduce(results, (acc, a) => {
          if (!a || isEmpty(a)) return acc;

          acc.push(a);

          return acc;
        }, []);

        if (articles.length)
          sendEmailNotificationMessage.call(this, articles);
      })
    ).catch(console.log)
  ;
}

function createMailTransport()
{
  return new Promise((resolve, reject) => {

    if (!cnf.get('exchange:createTestAccount')) return resolve(
      nodemailer.createTransport({
        debug: true,
        host: cnf.get('exchange:host'),
        secureConnection: false,
        port: 587,
        auth: {
              user: cnf.get('exchange:username'),
              pass: cnf.get('exchange:password')
        },
        connectionTimeout: 10000
      })
    );

    nodemailer.createTestAccount((err, account) => {
      if (err) return reject(err);

      // create reusable transporter object using the default SMTP transport
      return resolve(nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false, // true for 465, false for other ports
          auth: {
              user: account.user, // generated ethereal user
              pass: account.pass // generated ethereal password
          }
      }));
    });
  });
}

function sendMail(transporter, options)
{
  return new Promise((resolve, reject) => {
    // send mail with defined transport object
    transporter.sendMail(options, (error, info) => {
        if (error) return reject(error.message);

        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

        return resolve(info);
    });
  });
}

function sendEmailWithCertificate(settings)
{
  return createMailTransport()
    .then(transporter => {
      const attachments = reduce(settings.articles, (acc, article) => {
        acc.push({path: article.filePath});
        return acc;
      }, []);

      const mailOptions = {
          from: cnf.get('exchange:from'), // sender address
          to: settings.recipients, // list of receivers
          subject: settings.subject, // Subject line
          text: settings.body, // plain text body
          html: settings.body, // html body
          attachments
      };

      return sendMail(transporter, mailOptions)
        .then(info => {
          this.clients.forEach(client => {
            client.emit('email_success', info.accepted);
          });

          return info;
        })
        .catch(e => {
          this.clients.forEach(client => {
            client.emit('email_failed', e);
          });

          return e;
        })
      ;
    })
  ;
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

function sendEmailNotificationMessage(results)
{
  if (!results.length) return;

  this.clients.forEach(client => {
    client.emit('email', results);
  });
}

function setup(insts) {
  io.on('connection', client => {
    insts.clients.push(client);

    if (cnf.get('exchange:test'))
      sendEmailNotificationMessage.call(insts, cnf.get('exchange:testArticles'));

    client.on('settings', settings => {
      updateSettings(insts, settings);
    });

    client.on('email', data => {
      sendEmailWithCertificate.call(insts, data)
        .then(console.log).catch(console.log)
      ;
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

          return /.*[^.pdf,PDF]$/.test(path);
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
                    obj.stockItem['LASTSER#3'] = insts.settings.fixed_date;

                return obj.stockItem;
            })
            .then(stockItem => {
              const body = genUpdateStockItemBody(stockItem['LASTSER#3'], stockItem.SERNO, stockItem.STATUS, stockItem.ITEMNO);

              return updateStockItem(body)
                .then(resp => ({ stockItem, resp }))
              ;
            })
            .then(copyPDFToFolder)
            .then(obj => {
              const body = genCreateContDocBody(obj.stockItem.ITEMNO, obj.filename, obj.stockItem['LASTSER#3']);

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
              // copy pdf to failed folder
              return copyPDFToFailedFolder(path)
                .then(() => {
                  const logMsg = { msg: e.message, ts: moment().format('x'), id: uuid() };

                  insts.redis.set(buildRedisKey(logMsg.id, "failed"), JSON.stringify(logMsg));
                  notifyClients.call(insts, 'log', logMsg);
                })
                .catch(console.log)
              ;
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

          return /.*[^.csv,CSV]$/.test(path);
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
      watcher.on('add', (file) => {
          const filename = path.parse(file).base;
          pending.push(file);

          getJSONFromCSV(file)
          .then(data => prepCSVObjects.call(insts, data))
          .then(data => {
            return findStockItems(uniq(data.map(o => o.articleNumber)))
              .then(results => {
                  if (!results.length) {
                    return bb.map(data, obj => genPDF(obj).catch(console.log))
                      .then(() => {
                        const logMsg = { msg: 'Bestandsnaam ' + filename + ' heeft geen overeenkomst in de database.', ts: moment().format('x'), id: uuid() };
                        notifyClients.call(insts, 'log', logMsg);

                        return insts.redis.set(buildRedisKey(logMsg.id, "failed"), JSON.stringify(logMsg));
                      })
                    ;
                  }

                  return results;
              })
              .then(stockItems => mapCSVObjectsToStockItems(data, stockItems))
              .then(mapped => {
                  return bb.map(mapped, obj => {
                      if (!obj.match) {
                        return genPDF(obj)
                          .then(() => {
                            const logMsg = { msg: 'Artikel ' + obj.articleNumber + ' heeft geen overeenkomst in de database.', ts: moment().format('x'), id: uuid() };
                            notifyClients.call(insts, 'log', logMsg);

                            return insts.redis.set(buildRedisKey(logMsg.id, "failed"), JSON.stringify(logMsg));
                          })
                        ;
                      }

                      const serno = (obj.articleSerialnumber.length ? obj.articleSerialnumber : obj['SERNO']);
                      const body  = genUpdateStockItemBody(obj.testDate, serno, obj.STATUS, obj.ITEMNO);

                      return updateStockItem(body)
                        .then(resp => genPDF(obj))
                        .then(paths => {
                          const contDocBody = genCreateContDocBody(obj.ITEMNO, paths.winFileName, obj.testDate);

                          return createContdoc(contDocBody).then(resp => paths.winFileName);
                        })
                        .then(filePath => {

                          const logMsg = { msg: "Certificaat " + filePath.split('/').pop() + " succesvol gekoppeld aan artikel " + obj.ITEMNO, ts: moment().format('x'), id: uuid()};

                          obj['LASTSER#3'] = obj.testDate;

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
              .catch(e => {
                const logMsg = { msg: e.message, ts: moment().format('x'), id: uuid() };
                notifyClients.call(insts, 'log', logMsg);

                return insts.redis.set(buildRedisKey(logMsg.id, "failed"), JSON.stringify(logMsg));
              })
          });
      });
  });

  return watcher;
}

function genPDF(obj)
{
  return new bb((resolve, reject) => {
    obj.testDate    = moment(obj.testDate).format('DD-MM-YYYY');
    obj.testTime    = moment(obj.testTime, ['h:m:a', 'H:m']).format('HH:mm:ss');
    obj.validUntil  = moment(obj.testDate, 'DD-MM-YYYY').add('years', 1).format('DD-MM-YYYY');

    const prepped = reduce(Object.keys(obj), (acc, k) => {
      if (k.indexOf('test') >= 0 && k.indexOf('@') > 0) {
        const parts = k.split('@');

        acc[parts[0]] = { value: obj[k], header: parts[1] };

        return acc;
      }

      acc[k] = { value: obj[k], header: null };

      return acc;

    }, {});

    let filePath;
    let fileName;
    let winFileName = null;

    if (!obj.ITEMNO) {
      filePath = cnf.get('pdfDirFailed');
      fileName = filePath + obj.articleNumber + '.pdf';
    } else {
      filePath          = cnf.get('pdfDir') + obj.PGROUP + '/' + obj.GRPCODE;
      fileName          = filePath + '/' + obj.ITEMNO + '.pdf';
      winFileName       = cnf.get('pdfDirWin') + '\\' + obj.PGROUP + '\\' + obj.GRPCODE + '\\' + obj.ITEMNO + '.pdf'
    }

    const html = genHTML(prepped);

    fsPath.mkdir(filePath, err => {
      if (err) return reject(err);

      xvfb.startSync();

      wkhtmltopdf(html, { output: fileName,  pageSize: 'A4', "margin-top": 0, "margin-bottom": 0, "margin-left": 0, "margin-right": 0, disableSmartShrinking: true }, (err) => {
        xvfb.stopSync();

        if (err) return reject(err);

        resolve({winFileName, fileName});
      });
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

    if (!stockItem) {
      obj.match = false;
      acc.push(obj);
      return acc;
    }

    const testDate = moment(obj.testDate);
    const lastser = moment(stockItem['LASTSER#3']);

    if (lastser.isValid() && moment(lastser.format('YYYY-MM-DD')).isSameOrAfter(moment(testDate).format('YYYY-MM-DD')))
      return acc;

    obj.match = true;

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

    const m = moment(obj.testDate, ["DD/MM/YYYY", "DD-MM-YYYY"]);

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
    const filename = filePath + '/' + obj.stockItem.ITEMNO + '.pdf';

    obj.filename = cnf.get('pdfDirWin') + '\\' + obj.stockItem.PGROUP + '\\' + obj.stockItem.GRPCODE + '\\' + obj.stockItem.ITEMNO + '.pdf'

    return new bb((resolve, reject) => {
      fsPath.mkdir(filePath, function(err) {
        if (err) return reject(err);

        fsPath.copy(obj.stockItem.path, filename, err => {
          if (err) return reject(err);

          return resolve(obj);
        });
      });

    });
}

function copyPDFToFailedFolder(filepath)
{
    const filename = cnf.get('pdfDirFailed') + path.parse(filepath).base;

    return new bb((resolve, reject) => {
      fsPath.copy(filepath, filename, err => {
        if (err) return reject(err);

        return resolve(filepath);
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

function getStockStatusUpdates(date)
{
  return rp(
    {
      uri: cnf.get('api:uri') + '/contitem/status/' + date,
      headers: {
        'Authorization': 'Basic ' + new Buffer(cnf.get('api:auth:username') + ':' + cnf.get('api:auth:password')).toString('base64')
      },
      json: true
    }
  ).then(resp => resp.body);
}

function getStockItemFromPDF(filepath) {
  return new bb((resolve, reject) => {
    pdfText(filepath, (err, chunks) => {
      if (!chunks)
        return reject(new Error('Could not read contents of file: ' + filepath));

      return findStockItem(chunks, filepath, true)
        .then(result => {
            const stockItem = result.stockItem;
            chunks          = result.chunks;

            stockItem.SERNO         = extractSerialNumber(chunks);
            stockItem['LASTSER#3']  = extractDate(chunks);
            stockItem.path          = filepath;

            resolve(stockItem)
      })
      .catch(e => { console.log(e); return reject(e); } );
    });
  });
}

function findStockItem(chunks, filepath, advanced)
{
  const filename  = path.parse(filepath).base;
  const re        = /^([a-zA-Z0-9]){3,20}$/;
  const matches   = [];

  chunks.forEach(chunk => {
    const parts = chunk.split(' ');

    if (!parts || !parts.length) {
      const a = re.exec(chunk.replace(/[^a-z0-9]+/gi, ""));

      if (!a) return;

      matches.push(a[0]);

      return;
    }

    parts.forEach(str => {
      const a = re.exec(str.replace(/[^a-z0-9]+/gi, ""));

      if (!a) return;

       matches.push(a[0]);
    });
  });

  if (!matches.length && advanced) return tryOCR(filepath);

  if (!advanced) {
      const replaceOOsWithZeros = str => {
          const indices = [];

          for(let i = 0;i < str.length;i++) if (str[i] === 'O') indices.push(i);

          matches.push(str.replace(/O/g, "0"));
          indices.forEach(index => { matches.push(str.substr(0, index) + '0' + str.substr(index + 1)) });
      };

      matches.forEach(m => {
          if (m.indexOf("O") === -1) return;

          replaceOOsWithZeros(m);
      });
  }


  return findStockItems(matches)
    .then(results => {
        if (!results.length)
          throw new Error('Bestandsnaam ' + filename + ' heeft geen overeenkomst in de database.');

        if (results.length > 1)
            throw new Error('Bestandsnaam ' + filename + ' heeft meerdere overeenkomsten in de database.');

        return { stockItem: results[0], chunks };
    })
  ;
}

/**
 * Optical Character Recognition
 *
 * @param filepath
 */
function tryOCR(filepath)
{
    const filename  = path.parse(filepath).base;

    const imgOptions = {
        type        : 'bmp',
        size        : 1024,
        density     : 600,
        outputdir   : '/tmp',
        outputname  : moment().unix() + '_pdf_img',
        page        : 0
    };

    return new bb((resolve) => {
        pdf2img.setOptions(imgOptions);

        pdf2img.convert(filepath, function(err, info) {
            if (err) {
                console.log(err);
                return resolve(false);
            }

            const img = get(info, 'message[0].path');

            if (!img) return resolve(false);

            const OCROptions = {
                input   : img,
                output  : '/tmp/' + filename.replace('pdf', 'txt'),
                format  : 'text'
            };

            ocr.recognize(OCROptions, function(err, document) {
                if (err) {
                    console.error(err);
                    return resolve(false);
                }

                const text = get(document, 'text');

                // cleanup
                fs.unlinkSync(img);
                fs.unlinkSync(OCROptions.output);

                return findStockItem(text.split("\n"), filepath, false).then(results => resolve(results));
            });
        });
    });
}

function extractDate(chunks) {
    const baseDatumIndex          = chunks.indexOf('Datum');
    const datumIndex              = chunks.indexOf('Datum:');
    const dateOfCalibrationIndex  = chunks.indexOf('Date of calibration');
    const dateOf1stTestIndex      = chunks.indexOf('(Date of 1st test)');
    const time                    = moment().format('HH:mm:ss.SSS');

    if (baseDatumIndex > -1) {
    const m = moment(chunks[baseDatumIndex + 1], 'DD-MM-YYYY');

    if (m.isValid()) return m.format('YYYY-MM-DD') + ' ' + time;
    }

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

    // try specific index (12) for pdfs where only the values can be extracted (because of use of images)
    const m = moment(chunks[12], 'DD-MM-YYYY');

    if (m.isValid()) return m.format('YYYY-MM-DD') + ' ' + time;

    // when OCR is used, we get an array of text lines

    const datumMatches = chunks.filter(s => s.includes('Datum'));

    if (datumMatches && datumMatches.length) {
        const parts = datumMatches[0].split(' ');
        const m     = moment(parts[parts.length  -1], 'DD-MM-YYYY');

        if (m.isValid()) return m.format('YYYY-MM-DD') + ' ' + time;
    }

    const dateOfValidationMatches = chunks.filter(s => s.includes('Date of Validation'));

    if (dateOfValidationMatches && dateOfValidationMatches.length) {
        const parts = dateOfValidationMatches[0].split(' ');
        const m     = moment(parts[parts.length  -1], 'DD-MM-YYYY');

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

    // when OCR is used, we get an array of text lines

    const serienummerMatches = chunks.filter(s => s.includes('Serienummer'));

    if (serienummerMatches && serienummerMatches.length) {
        const parts = serienummerMatches[0].split(' ');
        return parts[parts.length -1];
    }

    const serialNumberMatches = chunks.filter(s => s.includes('Serial number'));

    if (serialNumberMatches && serialNumberMatches.length) {
        const parts = serialNumberMatches[0].split(' ');
        return parts[parts.length -1];
    }

  return null;
}
