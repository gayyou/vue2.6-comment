/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 * 重置历程状态
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0  // 将列表的状态进行重置
  has = {}  // 将has进行重置
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false  // 将队列的状态进行重置
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()  // 获得当前时间
  flushing = true   // 调整状态，正在一个一个执行队列
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)  父组件总是先于子组件进行更新，因为父组件总是比子组件先创建
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)  组件的自定义的watcher（computed、watch属性都会比render的监听者先更新）
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.  父组件的观察者正在观察子组件，但是子组件销毁了，那么这个观察者就会被跳过
  // 在清空队列的时候先进行排序
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed    这里强调不会先缓存这个队列，因为队列随时会增加
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      // 到目前为止只有渲染函数的观察者带有这个参数，这个参数是进行修改vm的状态为beforUpdate
      watcher.before()
    }
    id = watcher.id
    has[id] = null
    watcher.run()   // 进行执行依赖的回调函数
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  const updatedQueue = queue.slice()
  // 在重新设置state之前进行拷贝数组

  resetSchedulerState()   // 重置状态，将waiting、flushing重置，并且将已经执行过的watcher对象散列表进行重置

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)    // 回调组件活跃钩子
  callUpdatedHooks(updatedQueue)      // 回调update状态钩子

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    // 工具的钩子进行回调
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 * 將觀察者推入觀察者隊列。这个队列在工作的时候是没有相同的两个id存在的除非这个队列正在被清除（也就是出队操作）
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      // 如果是正在flush队列的时候，不会进行id的检测
      // （这是因为清除队列的时候相同的id很有可能被清除，如果进行防止重复操作的话，那么可能下次就不会监听某个对象）
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        // 在非生产环境下并且是同步操作的时候会进行刷新队列
        flushSchedulerQueue()
        return
      }
      // 等待下一个tick的时候进行刷新生命周期
      nextTick(flushSchedulerQueue)
    }
  }
}
