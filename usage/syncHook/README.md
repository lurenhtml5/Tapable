## Tapable-SyncHook

#### 执行方式

同步串行，即各个监听函数的返回值无任何关联，也不存在a函数的返回值作为b函数的入参数的场景，属于basicHook

#### SyncHook的用法

```javascript
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
queue.call('hello world')
// hello world 1
// hello world 2
// hello world 3
```

#### SyncHook的实现

```javascript
class SyncHook {
    constructor() {
        this.taps = []
    }
    tap (name, fn) {
        this.taps.push(fn)
    }
    call() {
        this.taps.forEach(fn => fn(...arguments))
    }
}
```

#### SyncHook的源码解读

首先看下入口文件SyncHook.js

```javascript
"use strict";
const Hook = require("./Hook");
const HookCodeFactory = require("./HookCodeFactory");
class SyncHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onDone,
			rethrowIfPossible
		});
	}
}
const factory = new SyncHookCodeFactory();
class SyncHook extends Hook {
	tapAsync() {
		throw new Error("tapAsync is not supported on a SyncHook");
	}
	tapPromise() {
		throw new Error("tapPromise is not supported on a SyncHook");
	}
	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}
module.exports = SyncHook
```

SyncHook继承自基类Hook，先不着急看Hook代码，看到这里的tapAsync和tapPromise，其实就已经能看出，SyncHook是不支持异步绑定时间和回调的方式；compile方法应该是重写了Hook内部的compile。

下面看下基类Hook的内部实现

先看下Hook的构造函数

```javascript
constructor(args) {
		if (!Array.isArray(args)) args = [];
		this._args = args;
		this.taps = [];
		this.interceptors = [];
		this.call = this._call;
		this.promise = this._promise;
		this.callAsync = this._callAsync;
		this._x = undefined;
	}
```

在我们 new SyncHook(['param1']) 的时候，会对taps、call、_args进行初始化

queue.tap的时候，会走到tap方法

```javascript
tap(options, fn) {
		if (typeof options === "string") options = { name: options };
		if (typeof options !== "object" || options === null)
			throw new Error(
				"Invalid arguments to tap(options: Object, fn: function)"
			);
		options = Object.assign({ type: "sync", fn: fn }, options);
		if (typeof options.name !== "string" || options.name === "")
			throw new Error("Missing name for tap");
		options = this._runRegisterInterceptors(options);
		this._insert(options);
	}
```

表明tap的第一个入参要么是字符串要么是对象，tap会将构造好的options对象，传入_insert方法

```javascript
_insert(item) {
		this._resetCompilation();
		let before;
		if (typeof item.before === "string") before = new Set([item.before]);
		else if (Array.isArray(item.before)) {
			before = new Set(item.before);
		}
		let stage = 0;
		if (typeof item.stage === "number") stage = item.stage;
		let i = this.taps.length;
		while (i > 0) {
			i--;
			const x = this.taps[i];
			this.taps[i + 1] = x;
			const xStage = x.stage || 0;
			if (before) {
				if (before.has(x.name)) {
					before.delete(x.name);
					continue;
				}
				if (before.size > 0) {
					continue;
				}
			}
			if (xStage > stage) {
				continue;
			}
			i++;
			break;
		}
		this.taps[i] = item;
	}
```

因为SyncHook的tap注册时候，传的只是字符串，所以不关心这里跟before相关的逻辑；只需要关系往this.taps里面插值的过程，这里相当于是一个push的过程，这里相当于把上面构造的options作为参数传入this.taps

那么我在执行queue.call的时候发生了什么呢

```javascript
_resetCompilation() {
  this.call = this._call;
  this.callAsync = this._callAsync;
  this.promise = this._promise;
}
```

我们可以看到无论是在_insert的初始阶段还是在构造函数里面，都对call方法进行了初始化赋值

```javascript
Object.defineProperties(Hook.prototype, {
	_call: {
		value: createCompileDelegate("call", "sync"),
		configurable: true,
		writable: true
	},
	_promise: {
		value: createCompileDelegate("promise", "promise"),
		configurable: true,
		writable: true
	},
	_callAsync: {
		value: createCompileDelegate("callAsync", "async"),
		configurable: true,
		writable: true
	}
});
```

这里可以看到，_call被挂载到了Hook的原型对象上，当我们在执行this.call = this._call的时候，其实是会执行createCompileDelegate("call", "sync")

接着往下看

```javascript
function createCompileDelegate(name, type) {
	return function lazyCompileHook(...args) {
		this[name] = this._createCall(type);
		return this[name](...args);
	};
}
```

可以看到这里对this.call方法通过this._createCall方法进行了重新定义

```javascript
_createCall(type) {
  return this.compile({
    taps: this.taps,
    interceptors: this.interceptors,
    args: this._args,
    type: type
  });
}
compile(options) {
  throw new Error("Abstract: should be overriden");
}
```

这里的compile方法其实在SyncHook.js里面被重写掉了

```javascript
compile(options) {
  factory.setup(this, options);
  return factory.create(options);
}
```

这时候我们需要看到SyncHookCodeFactory里面

```javascript
setup(instance, options) {
	instance._x = options.taps.map(t => t.fn);
}
```

```javascript
create(options) {
		this.init(options);
		let fn;
		switch (this.options.type) {
			case "sync":
				fn = new Function(
					this.args(),
					'"use strict";\n' +
						this.header() +
						this.content({
							onError: err => `throw ${err};\n`,
							onResult: result => `return ${result};\n`,
							resultReturns: true,
							onDone: () => "",
							rethrowIfPossible: true
						})
				);
				break;
			case "async":
				fn = new Function(
					this.args({
						after: "_callback"
					}),
					'"use strict";\n' +
						this.header() +
						this.content({
							onError: err => `_callback(${err});\n`,
							onResult: result => `_callback(null, ${result});\n`,
							onDone: () => "_callback();\n"
						})
				);
				break;
			case "promise":
				let errorHelperUsed = false;
				const content = this.content({
					onError: err => {
						errorHelperUsed = true;
						return `_error(${err});\n`;
					},
					onResult: result => `_resolve(${result});\n`,
					onDone: () => "_resolve();\n"
				});
				let code = "";
				code += '"use strict";\n';
				code += "return new Promise((_resolve, _reject) => {\n";
				if (errorHelperUsed) {
					code += "var _sync = true;\n";
					code += "function _error(_err) {\n";
					code += "if(_sync)\n";
					code += "_resolve(Promise.resolve().then(() => { throw _err; }));\n";
					code += "else\n";
					code += "_reject(_err);\n";
					code += "};\n";
				}
				code += this.header();
				code += content;
				if (errorHelperUsed) {
					code += "_sync = false;\n";
				}
				code += "});\n";
				fn = new Function(this.args(), code);
				break;
		}
		this.deinit();
		return fn;
	}
```

可以看到setup会被options里面回调函数全部提取出来，放到_x上；在create方法里面，通过不同的type，然后拼接出不同的字符串，交给new Function来执行

content方法在SyncHook.js里面实现

```javascript
class SyncHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onDone,
			rethrowIfPossible
		});
	}
}
```

```javascript
callTapsSeries({
		onError,
		onResult,
		resultReturns,
		onDone,
		doneReturns,
		rethrowIfPossible
	}) {
		if (this.options.taps.length === 0) return onDone();
		const firstAsync = this.options.taps.findIndex(t => t.type !== "sync");
		const somethingReturns = resultReturns || doneReturns || false;
		let code = "";
        let current = onDone;
		for (let j = this.options.taps.length - 1; j >= 0; j--) {
			const i = j;
			const unroll = current !== onDone && this.options.taps[i].type !== "sync";
			if (unroll) {
				code += `function _next${i}() {\n`;
				code += current();
				code += `}\n`;
				current = () => `${somethingReturns ? "return " : ""}_next${i}();\n`;
			}
            const done = current;
			const doneBreak = skipDone => {
				if (skipDone) return "";
				return onDone();
            };
			const content = this.callTap(i, {
				onError: error => onError(i, error, done, doneBreak),
				onResult:
					onResult &&
					(result => {
						return onResult(i, result, done, doneBreak);
					}),
				onDone: !onResult && done,
				rethrowIfPossible:
					rethrowIfPossible && (firstAsync < 0 || i < firstAsync)
			});
			current = () => content;
		}
		code += current();
		return code;
	}
```

```javascript
callTap(tapIndex, { onError, onResult, onDone, rethrowIfPossible }) {
		let code = "";
		let hasTapCached = false;
		for (let i = 0; i < this.options.interceptors.length; i++) {
			const interceptor = this.options.interceptors[i];
			if (interceptor.tap) {
				if (!hasTapCached) {
					code += `var _tap${tapIndex} = ${this.getTap(tapIndex)};\n`;
					hasTapCached = true;
				}
				code += `${this.getInterceptor(i)}.tap(${
					interceptor.context ? "_context, " : ""
				}_tap${tapIndex});\n`;
			}
		}
		code += `var _fn${tapIndex} = ${this.getTapFn(tapIndex)};\n`;
		const tap = this.options.taps[tapIndex];
		switch (tap.type) {
			case "sync":
				if (!rethrowIfPossible) {
					code += `var _hasError${tapIndex} = false;\n`;
					code += "try {\n";
				}
				if (onResult) {
					code += `var _result${tapIndex} = _fn${tapIndex}(${this.args({
						before: tap.context ? "_context" : undefined
          })});\n`;
          console.log(code, 'bbbb')
				} else {
					code += `_fn${tapIndex}(${this.args({
						before: tap.context ? "_context" : undefined
					})});\n`;
				}
				if (!rethrowIfPossible) {
					code += "} catch(_err) {\n";
					code += `_hasError${tapIndex} = true;\n`;
					code += onError("_err");
					code += "}\n";
					code += `if(!_hasError${tapIndex}) {\n`;
				}
				if (onResult) {
					code += onResult(`_result${tapIndex}`);
				}
        if (onDone) {
					code += onDone();
				}
				if (!rethrowIfPossible) {
					code += "}\n";
        }
				break;
			case "async":
				let cbCode = "";
				if (onResult) cbCode += `(_err${tapIndex}, _result${tapIndex}) => {\n`;
				else cbCode += `_err${tapIndex} => {\n`;
				cbCode += `if(_err${tapIndex}) {\n`;
				cbCode += onError(`_err${tapIndex}`);
				cbCode += "} else {\n";
				if (onResult) {
					cbCode += onResult(`_result${tapIndex}`);
				}
				if (onDone) {
					cbCode += onDone();
				}
				cbCode += "}\n";
				cbCode += "}";
				code += `_fn${tapIndex}(${this.args({
					before: tap.context ? "_context" : undefined,
					after: cbCode
				})});\n`;
				break;
			case "promise":
				code += `var _hasResult${tapIndex} = false;\n`;
				code += `var _promise${tapIndex} = _fn${tapIndex}(${this.args({
					before: tap.context ? "_context" : undefined
				})});\n`;
				code += `if (!_promise${tapIndex} || !_promise${tapIndex}.then)\n`;
				code += `  throw new Error('Tap function (tapPromise) did not return promise (returned ' + _promise${tapIndex} + ')');\n`;
				code += `_promise${tapIndex}.then(_result${tapIndex} => {\n`;
				code += `_hasResult${tapIndex} = true;\n`;
				if (onResult) {
					code += onResult(`_result${tapIndex}`);
				}
				if (onDone) {
					code += onDone();
				}
				code += `}, _err${tapIndex} => {\n`;
				code += `if(_hasResult${tapIndex}) throw _err${tapIndex};\n`;
				code += onError(`_err${tapIndex}`);
				code += "});\n";
				break;
		}
		return code;
	}

```

对于SyncHook而言，重点就在a和b处两句代码

```javascript
a: code += `var _fn${tapIndex} = ${this.getTapFn(tapIndex)};\n`;
```

```javascript
getTapFn(idx) {
	return `_x[${idx}]`;
}
```

```javascript
b: code += `_fn${tapIndex}(${this.args({
	before: tap.context ? "_context" : undefined
})});\n`;
```

```javascript
args({ before, after } = {}) {
  let allArgs = this._args;
  if (before) allArgs = [before].concat(allArgs);
  if (after) allArgs = allArgs.concat(after);
  if (allArgs.length === 0) {
  	return "";
  } else {
  	return allArgs.join(", ");
  }
}
```

这里的_args其实就是_createCall传入的args，也即是new SyncHook时传入的参数

这部分是拼接代码字符串的主要过程，得到的字符串如下：

```javascript
var _fn2 = _x[2]; // a的产出
_fn2(param1); // b的产出
var _fn1 = _x[1];
_fn1(param1);
var _fn2 = _x[2];
_fn2(param1);
```

得到以上字符串之后，再交给new Function来执行；

以上是Tapable-SyncHook的用法、实现以及源码解析；