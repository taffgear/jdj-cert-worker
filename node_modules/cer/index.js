'use strict'

const assert = require('assert')

module.exports = createCustomError

function createCustomError(name, init, parent) {
    parent = parent || Error

    assert.equal(typeof name, 'string', 'constructor name must be a string')
    assert(name, 'constructor name cannot be an empty string')
    if (init)
        assert.equal(typeof init, 'function', 'constructor must be a function')
    assert(parent === Error || parent.prototype instanceof Error, 'parent must be derived from Error()')

    const ctor = function () {
        // make `new` optional
        if (this instanceof ctor)
            var inst = this
        else
            inst = Object.create(ctor.prototype)

        // create base error object
        const err = parent.apply(inst, arguments)
        // get rid of irrelevant stack frames
        Error.captureStackTrace(err, ctor)

        inst.name = err.name = name
        inst.message = err.message

        // stack is not always important and is expensive to generate
        Object.defineProperty(inst, 'stack', {
            get: () => err.stack,
            configurable: true
        })

        if (init)
            init.apply(inst, arguments)

        return inst
    }

    // set function name (it appears in traces)
    Object.defineProperty(ctor, 'name', {
        value: name,
        configurable: true
    })

    // inherit from parent
    ctor.prototype = Object.create(parent.prototype)
    ctor.prototype.inspect = inspect
    ctor.prototype.constructor = ctor

    return ctor
}

function inspect() {
    return this.stack
}
