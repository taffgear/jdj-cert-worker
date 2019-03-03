[![view on npm](http://img.shields.io/npm/v/cer.svg?style=flat-square)](https://www.npmjs.com/package/cer)
[![downloads per month](http://img.shields.io/npm/dm/cer.svg?style=flat-square)](https://www.npmjs.com/package/cer)
[![node version](https://img.shields.io/badge/node-%3E=4-brightgreen.svg?style=flat-square)](https://nodejs.org/download)
[![build status](https://img.shields.io/travis/schwarzkopfb/cer.svg?style=flat-square)](https://travis-ci.org/schwarzkopfb/cer)
[![test coverage](https://img.shields.io/coveralls/schwarzkopfb/cer.svg?style=flat-square)](https://coveralls.io/github/schwarzkopfb/cer)
[![license](https://img.shields.io/npm/l/cer.svg?style=flat-square)](/LICENSE)

# cer

Utility to generate fast and correct custom error constructors.
This module exposes a factory function that creates error constructors which
are identical to the built-in `Error` function.

## Basic usage

```js
const error   = require('cer'),
      MyError = error('MyError'),
      err     = new MyError('example')
```

The following comparisons will always resolve to `true`:

```js
MyError.name === 'MyError'
err.name === 'MyError'
err.message === 'example'
err instanceof Error
err instanceof MyError
```

Stack trace is similar to the following:

```
MyError: example
    at Object.<anonymous> (example.js:3:16)
    at Module._compile (module.js:570:32)
    at Object.Module._extensions..js (module.js:579:10)
    at Module.load (module.js:487:32)
    at tryModuleLoad (module.js:446:12)
    at Function.Module._load (module.js:438:3)
    at Module.runMain (module.js:604:10)
    at run (bootstrap_node.js:394:7)
    at startup (bootstrap_node.js:149:9)
    at bootstrap_node.js:509:3
```

As you can see, irrelevant stack frames after error instantiation aren't appear in trace.

## Custom constructor

You can provide a custom constructor to do your own initialization when a new instance is being created.

```js
const error   = require('cer'),
      MyError = error('MyError', init),
      err     = new MyError('foo', 'bar')

function init(message, errorCode) {
    this.code = errorCode
}
```

And then:

```js
err.message === 'foo' // assigned automatically
err.code === 'bar'
```

## Multiple inheritance

```js
const error = require('cer'),
      DatabaseError = error('DatabaseError'),
      EntityDoesNotExistError = error('EntityDoesNotExistError', init, DatabaseError),
      err = new EntityDoesNotExistError('invalid id provided', 1)

function init(message, id) {
    this.id = id
}
```

And then:

```js
err instanceof Error
err instanceof DatabaseError
err instanceof EntityDoesNotExistError
err.id === 1
```

_Note:_ `init` is not required when you just want to inherit, you can pass a `null` instead.

## Extending prototype

```js
const error   = require('cer'),
      MyError = error('MyError')

MyError.prototype.example = 42

const err = new MyError
```

And then:

```js
err.example === 42
```

_Note:_ it works even if you do multiple inheritance.

## Installation

With npm:

    npm install cer

## Tests & benchmarks

Run the unit test suite:

    npm test

Run unit tests and create coverage report:

    npm run cover

Run benchmarks:

    npm run bench

## License

[MIT](/LICENSE)
