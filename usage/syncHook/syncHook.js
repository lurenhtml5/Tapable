
/**
 * 用法
 */
const { SyncHook } = require('../../lib')
const queue = new SyncHook(['param1'])

queue.tap('event 1', function (param1) {
    console.log(param1, '1')
})

queue.tap('event 2', function (param2) {
    console.log(param2, '2')
})

queue.tap('event 3', function (param3) {
    console.log(param3, '3')
})

queue.call('hello')


