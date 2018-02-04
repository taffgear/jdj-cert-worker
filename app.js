const each 					= require('lodash/each');
const pdfText       = require('pdf-text');
const moment        = require('moment');

const file          = process.env.FILE;

try {
  pdfText(file, function(err, chunks) {
    if (!chunks) throw new Error('Could not read contents of file: ' + file);

    const articleNumber = extractArticleNumber(chunks);
    const serialNumber  = extractSerialNumber(chunks);
    const date          = extractDate(chunks);

    console.log('artikelnummer: %s', articleNumber);
    console.log('datum: %s', date);
    console.log('serienummer: %s', serialNumber);
  });
} catch (e) {
  console.log(e.message);
}

function extractArticleNumber(chunks)
{

  // are there more pages with an article number?
  const fileHasMultipleMatches = (str, index) => {
    if (chunks.indexOf(str, index) > -1)
        throw new Error('Multiple certificates found in one file.');

    return false;
  }

  const identificationNumberIndex = chunks.indexOf('Identification number');
  const artikelnummerIndex        = chunks.indexOf('Artikelnummer:');
  const distinguishingNumberIndex = chunks.indexOf('(Distinguishing nr)');

  if (identificationNumberIndex > -1) {
    fileHasMultipleMatches('Identification number', identificationNumberIndex + 3);

    return chunks[identificationNumberIndex + 2];
  }

  if (artikelnummerIndex > -1) {
    fileHasMultipleMatches('Artikelnummer:', artikelnummerIndex + 2);

    return chunks[artikelnummerIndex + 1];
  }

  if (distinguishingNumberIndex > -1) {
      fileHasMultipleMatches('(Distinguishing nr)', distinguishingNumberIndex + 2);

      return chunks[distinguishingNumberIndex + 1];
  }

  return null;
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
