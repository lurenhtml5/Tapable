## Tapable

之前写了一个简易的webpack的实现，实现简单的代码打包，现在我们来了解下webpack的插件机制的核心：Tapable

对于Webpack有一句话**Everything is a plugin**，Webpack本质上是一种事件流的机制，它的工作流程就是将各个插件串联起来，而实现这一切的核心就是Tapable。Tapable有点类似nodejs的events库，核心原理也是依赖与发布订阅模式。webpack中最核心的负责编译的Compiler和负责创建bundles的Compilation都是Tapable的实例。

```javascript
const EventEmitter = require('events');
const myEmitter = new EventEmitter();
// 注册事件对应的监听函数
myEmitter.on('start', (params) => {
    console.log("输出", params)
});
// 触发事件 并传入参数
myEmitter.emit('start', '学习webpack工作流'); // 输出 学习webpack工作流

```



```javascript
const {
	SyncHook,
	SyncBailHook,
	SyncWaterfallHook,
	SyncLoopHook,
	AsyncParallelHook,
	AsyncParallelBailHook,
	AsyncSeriesHook,
	AsyncSeriesBailHook,
	AsyncSeriesWaterfallHook
 } = require("tapable");
```

以上是tapable的主要钩子

Tapable Hook概况

![](https://user-gold-cdn.xitu.io/2019/2/8/168cdb3c4c9a71b9?imageView2/0/w/1280/h/960/format/webp/ignore-error/1)

Tapable提供了很多类型的hook，分为同步和异步两大类(异步中又区分异步并行和异步串行)，而根据事件执行的终止条件的不同，由衍生出 Bail/Waterfall/Loop 类型。

![](https://user-gold-cdn.xitu.io/2018/12/28/167f458ac2b1e527?imageView2/0/w/1280/h/960/format/webp/ignore-error/1)

![](https://user-gold-cdn.xitu.io/2018/12/28/167f458d6ff8424f?imageView2/0/w/1280/h/960/format/webp/ignore-error/1)

**BasicHook:** 执行每一个，不关心函数的返回值，有 SyncHook、AsyncParallelHook、AsyncSeriesHook。

**BailHook:** 顺序执行 Hook，遇到第一个结果 result !== undefined 则返回，不再继续执行。有：SyncBailHook、AsyncSeriseBailHook, AsyncParallelBailHook。

**WaterfallHook:** 类似于 reduce，如果前一个 Hook 函数的结果 result !== undefined，则 result 会作为后一个 Hook 函数的第一个参数。既然是顺序执行，那么就只有 Sync 和 AsyncSeries 类中提供这个Hook：SyncWaterfallHook，AsyncSeriesWaterfallHook

**LoopHook:** 不停的循环执行 Hook，直到所有函数结果 result === undefined。同样的，由于对串行性有依赖，所以只有 SyncLoopHook 和 AsyncSeriseLoopHook （PS：暂时没看到具体使用 Case）



| 序号 | 钩子名称                 | 执行方式 | 使用要点                                                     |
| ---- | :----------------------- | -------- | ------------------------------------------------------------ |
| 1    | SyncHook                 | 同步串行 | 不关心监听函数的返回值                                       |
| 2    | SyncBailHook             | 同步串行 | 只要监听函数中有一个函数的返回值不为 undefined，<br />则跳过剩下所有的逻辑 |
| 3    | SyncWaterfallHook        | 同步串行 | 上一个监听函数的返回值可以传给下一个监听函数                 |
| 4    | SyncLoopHook             | 同步循环 | 当监听函数被触发的时候，如果该监听函数返回true时<br />则这个监听函数会反复执行，<br />如果返回 undefined 则表示退出循环 |
| 5    | AsyncParallelHook        | 异步并发 | 不关心监听函数的返回值                                       |
| 6    | AsyncParallelBailHook    | 异步并发 | 只要监听函数的返回值不为 null，就会忽略后面的监听函数执行，<br />直接跳跃到callAsync等触发函数绑定的回调函数，<br />然后执行这个被绑定的回调函数 |
| 7    | AsyncSeriesHook          | 异步串行 | 不关心callback()的参数                                       |
| 8    | AsyncSeriesBailHook      | 异步串行 | callback()的参数不为null，就会直接执行callAsync等触发函数绑定的回调函数 |
| 9    | AsyncSeriesWaterfallHook | 异步串行 | 上一个监听函数的中的callback(err, data)的第二个参数,<br />可以作为下一个监听函数的参数 |
| 10   | AsyncSeriesLoopHook      | 异步串行 | 可以触发handler循环调用。                                    |

参考链接：https://juejin.cn/post/6844904004435050503#heading-11

