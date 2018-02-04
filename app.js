const bb            = require('bluebird');
const chokidar      = require('chokidar');
const each 					= require('lodash/each');
const pdfText       = require('pdf-text');
const moment        = require('moment');

const pending       = [];
const watchDir      = '/home/markhorsman/jdj-certificates/';

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
          watcher.unwatch(path);

          genStockItemFromPDF(path)
            .then(stockItem => {
              console.log(stockItem);
            })
            .catch(console.log)
            .finally(() => pending.splice(pending.indexOf(path), 1))
          ;
      });
  });

  return watcher;
}

function genStockItemFromPDF(path) {
  return new bb((resolve, reject) => {
    pdfText(path, function(err, chunks) {
      if (!chunks)
        return reject(new Error('Could not read contents of file: ' + file));

      const stockItem = {};

      return extractArticleNumber(chunks)
        .then(articleNumber => {
          stockItem.itemno  = articleNumber;
          stockItem.serno   = extractSerialNumber(chunks);
          stockItem.lastser = extractDate(chunks);

          resolve(stockItem)
      })
      .catch(e => reject(e));
    });
  });
}

function extractArticleNumber(chunks)
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

    return resolve(null);
  });
}

function extractDate(chunks) {
  const datumIndex              = chunks.indexOf('Datum:');
  const dateOfCalibrationIndex  = chunks.indexOf('Date of calibration');
  const dateOf1stTestIndex      = chunks.indexOf('(Date of 1st test)');

  if (datumIndex > -1) {
    const m = moment(chunks[datumIndex + 1], 'DD-MM-YYYY');

    if (m.isValid()) return m.format('YYYY-MM-DD');
  }

  if (dateOfCalibrationIndex > -1) {
     const m = moment(chunks[dateOfCalibrationIndex + 2], 'DD MMMM YYYY');

     if (m.isValid()) return m.format('YYYY-MM-DD')
  }

  if (dateOf1stTestIndex > -1) {
    const m = moment(chunks[dateOf1stTestIndex + 1], 'DD-MM-YYYY');

    if (m.isValid()) return m.format('YYYY-MM-DD')
  }

  return null;
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
