/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options      // 获取vm的选项
  // console.log(vm)
  if (opts.props) initProps(vm, opts.props)     // 首先初始化props
  if (opts.methods) initMethods(vm, opts.methods)  // 其次初始化方法
  if (opts.data) {    // 最后初始化数据
    initData(vm)
  } else {
    // 这个true就是作为一个入口，也就是当访问的是一个组件或者vue实例对象两者的data属性的，就会传入true，如果不是的话就传入false
    observe(vm._data = {}, true /* asRootData */)   // 如果数据不是对象的话，那么进行初始化这个对象
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) {
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  let data = vm.$options.data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {

      proxy(vm, `_data`, key)
    }
  }

  // observe data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)  // 对vm的计算观察者进行定义
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    console.log(key)
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get  // 获取计算目标的getter方法
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 创建观察者对象
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      // 如果这个对象并不是vm的属性的话，进行定义计算属性
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      // 如果这个key是定义在vm中，进行报错
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

/**
 * @description
 * @param target
 * @param key
 * @param userDef
 */
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()   // 如果不是服务端渲染的话，那么就需要进行缓存
  if (typeof userDef === 'function') {
    // sharedPropertyDefining 是一个共享的属性定义对象
    // TODO 这里有个疑惑，就是这个sharedPropertyDefining存在的意义。为什么不直接用def来进行定义
    // TODO 上面的解释就是这个对象是一个共享的，即大家都能用，使用它的原因是要对它进行处理
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)  // 如果是浏览器环境下，则创造一个计算的getter方法
      : createGetterInvoker(userDef)  // 如果是服务端渲染的话，那么就返回
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false  // 在浏览器环境下并且userDef的缓存是开着的
        ? createComputedGetter(key) // 创建计算的getter属性
        : createGetterInvoker(userDef.get)    // 创建getter调用
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
    sharedPropertyDefinition.set === noop) {
      sharedPropertyDefinition.set = function () {
        warn(
          `Computed property "${key}" was assigned to but it has no setter.`,
          this
        )
      }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)  // 对compute目标进行定义
}


function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]  // 获取计算观察者中这个键值的属性的观察者
    if (watcher) {
      // 观察者存在的话，就进行判断，并且是不是计算属性，是的话就进行执行添加观察者依赖的操作
      if (watcher.dirty) {
        // 进行观察者依赖的添加
        watcher.evaluate()
      }
      if (Dep.target) {
        // 如果调用栈还是有Dep.target的话（很可能是一个渲染函数观察者的筐存在）
        // TODO 为什么要有这个东西？？
        // TODO 这个computed属性看似是一个方法，其实到最后会处理成一个
        //  属性，当这个属性被模板征用的时候会被观察者观察到。
        //  所以要进行依赖的添加操作。
        watcher.depend()
      }
      return watcher.value
      // 返回值
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]  // 缓存回调函数或者数组
    if (Array.isArray(handler)) {
      // 如果是一个数组的话就遍历进行执行
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      // 进行创造watcher
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    // 如果这个handler是一个对象的话，那么就机械能给你格式化
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    // 如果handler是一个字符串的话，代表这个这个是methods里面的回调函数
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)  // 进行观察并返回观察者对象
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  // 进行代理
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    // 这两个值就是代理的值，是不允许对这两个变量的代理指向进行修改的
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 进行代理的设置
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set // 进行代理方法
  Vue.prototype.$delete = del  // 进行代理方法

  // 定义观察者方法，并且这个方法暴露给用户
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      // 如果回调是一个纯对象的话，说明里面是有进行设置内容的，要去提取纯对象的内容
      return createWatcher(vm, expOrFn, cb, options)
    }
    // 防止选项传参时候出错
    options = options || {}
    options.user = true  //
    // 创建watcher选项观察者
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      // 判断这个观察者对象的immediate属性是否存在，这个属性的意义就是在初始化的时候就进行执行一遍
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    return function unwatchFn () {
      // 返回一个解除这个观察者的选项
      watcher.teardown()
    }
  }
}
