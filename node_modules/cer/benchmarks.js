/**
 * note: 'cerr' is not included, because that
 * have very limited functionality, which is
 * incomparable with 'cer' or 'custom-error'
 */

'use strict'

const bench   = require('bench'),
      Cer     = require('.')('MyError'),
      CustErr = require('custom-error')('MyError')

exports.compare = {
    cer: () => new Cer,
    'custom-error': () => new CustErr,
}

bench.runMain()
