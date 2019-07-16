/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,  // vm实例对象
    expOrFn: string | Function,   // 要观察的对象的路径或者被观察的函数
    cb: Function,   // 回调函数
    options?: ?Object,  // 传递给观察者的选项
    isRenderWatcher?: boolean // 是否是渲染函数的观察者
  ) {
    this.vm = vm    // 将vm实例和watcher进行捆绑
    if (isRenderWatcher) {
      vm._watcher = this  // 如果是渲染函数的观察者，那么就将vm的watcher设置为这个观察者对象
    }
    vm._watchers.push(this)   // 推进vm的观察者列表
    // options
    if (options) {
      // 用两个!!的原因很简单，如果是undefined的话，!!运算后就是false
      this.deep = !!options.deep    // 这个选项中是否要被深度观测
      this.user = !!options.user    // 用来标识当前观察者实例对象是 开发者定义的 还是 内部定义的
      this.lazy = !!options.lazy    // 是否进行懒加载
      this.sync = !!options.sync    // 是否是异步
      this.before = options.before  // 在数据变化之后，触发更新之前，进行执行该函数
    } else {
      // 如果没有传入options的话，那么就全都设为false
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb    // 缓存回调函数
    this.id = ++uid // uid for batching  记录观察者id
    this.active = true    // 是否是激活状态
    this.dirty = this.lazy // for lazy watchers
    /**
     * @description 这四个属性的设立是有目的的
     * 简介：deps是检测到setter方法进行执行的依赖筐，就是这个观察者所具有的的依赖
     * newDeps是存放通过getter方法引入的暂时的依赖以及通过remove删除的依赖
     * 我的猜想是这些deps或者depsid都是本观察者所在的dep
     * @type {Array} deps 旧的依赖筐，存放数组的依赖筐
     * @type {Array} newDeps 新的依赖筐
     * @type {Set} depIds 存放旧的依赖筐中具有的依赖的id
     * @type {Set} newDepIds 存放新的依赖筐中具有的依赖的id
     */
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()   // 散列表
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      // 如果要观察的对象是一个函数，那么直接将getter设为这个函数
      this.getter = expOrFn
    } else {
      // 此时要观察的是一个对象的属性
      // 将对象的属性进行解析（这个是一个字符串，要将字符串解析为一个对象的索引路径
      // （封装成一个函数，调用的时候返回这个对象的指针），并且赋值给getter）
      // 然后执行这个函数就相当于调用了相应对象属性的getter方法，从而实现依赖的添加
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        // getter不存在的话，先赋值为空，并且在非生产环境下报错
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy      // 如果是一个计算属性的话，那么就返回undefined（惰性求值），否则调用get方法
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * 通过执行这个方法，对象属性的依赖进行添加
   * 在这里通过将本watcher进行推进到target的stack中，然后在本观察者的观察对象进行getter方法的调用收集依赖的时候进行收集依赖
   */
  get () {
    // debugger
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 触发依赖的搜集
      value = this.getter.call(vm, vm)    // 执行getter方法，前面无论是function类型的还是obj类型的观测者对象都会被封装成函数，在这里进行调用
    } catch (e) {
      if (this.user) {
        // 报错
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // 是否是深度观察，如果是的话就将这个深度观察进行遍历来让这个对象的所有子项都添加了依赖
        traverse(value)
      }
      popTarget()
      // 添加完依赖后，要交换一下进行更新deps框
      // 进行清空临时的依赖筐
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   * 这个addDep要和cleanupDeps一起看
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      // 如果这个依赖的框并不在newDepIds里面，那么就进行添加到散列表中，
      // 并且在依赖村放放的框进行添加，如果有的话就不进行添加，这是避免依赖的重复添加
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 如果这个id并不在depIds里面，也就是之前没有添加过的，那么要在这个属性的依赖筐中进行添加本观察者
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 这个方法的思路很简单，将deps有的项但是newDeps没有的项从deps进行删除。
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      // 这一个是进行更新将旧的依赖框数组进行更新
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        // 遍历旧的deps，如果筐中存在的id在新的筐中不存在的话，进行从dep的依赖中删除，如果在newDepIds中不存在的id，则进行删除
        //
        dep.removeSub(this)
      }
    }
    // 将newDepId和depId进行交换，从而避免申请新的内存，先进行id散列表的交换
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()  // 将newDepIds散列表进行清空。
    // 进行依赖框的交换
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   * 进行依赖的更新
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      /// 如果懒加载存在的话，dirty属性为true（旧版代码里面是computed属性）
      this.dirty = true
    } else if (this.sync) {
      // 如果是异步加载的话，执行run函数
      this.run()
    } else {
      // 先进行观察者的推进，然后根据生命周期进行观察者的执行
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   * 被schduler进行调用
   */
  run () {
    if (this.active) {
      const value = this.get()   // 执行getter方法，并且添加依赖后将返回值存留下来，并且触发搜集依赖
      if (
        // 这个值发生了改变
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        // 深度遍历还有对象或者数组具有突发性(其实是对象的时候，这个对象的指针是不会发生改变的，但是这个对象的属性是会发生改变的)，所以要进行调用
        isObject(value) ||
        this.deep
      ) {
        // set new value
        // 缓存旧的值并设置新的值
        const oldValue = this.value
        this.value = value
        if (this.user) {
          // 如果是用户自定义的属性的话，要进行检验是否错误，vue框架自带的是不会出现异常的
          try {
            // watcher的将回调函数进行执行
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   * 触发的时候是将deps筐内的watcher进行逐一触发回调函数
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   * 在vue对象的消亡阶段，对watcher的所有依赖者进行解除依赖
   */
  teardown () {
    if (this.active) {
      // watcher初始化的时候是活跃的，如果是活跃的说明没有死亡
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        // 移除vm的watcher挂载
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        // 移除所有依赖
        this.deps[i].removeSub(this)
      }
      // 改变状态
      this.active = false
    }
  }
}
