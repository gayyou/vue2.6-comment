/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)  //

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    def(value, '__ob__', this)    // 如果一个对象那个是Object的话，那么会对这个对象进行添加__object__属性
    if (Array.isArray(value)) {
      // 如果这个属性是一个数组的话，那么我们就对这个
      if (hasProto) {
        protoAugment(value, arrayMethods)   // 如果对象中有这个__proto__属性的话，这个也就是
      } else {
        copyAugment(value, arrayMethods, arrayKeys)   // 当对象实例没有可以指向原型的属性的时候，退而求其次，每个对象都要加上array的方法
      }
      this.observeArray(value)  // 遍历数组进行观察
    } else {
      this.walk(value)    // 其他的类型的话进行观察对象
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    // 获取数组的所有方法的键值，逐一对数组进行赋值这些键值
    const key = keys[i]
    def(target, key, src[key])   // 不加第四个参数，说明这个是一个不可以迭代找到的属性
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // console.log(value)
  if (!isObject(value) || value instanceof VNode) {   // 判断第一个参数是否是对象并且这个对象，如果不是对象的话，那么会不会继续执行
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)      // 如果这个对象没有被观察，当符合条件的时候就会进行观测
  }
  if (asRootData && ob) {
    // 作为一个rootData，我们可以看到这个observe是一个递归遍历函数，当入口的时候才会传入这个传参，也就是说通过data返回的对象就是
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 当你看到这里的时候，要记住这个函数其实是一个闭包函数，也就是每个对象的属性如果可以设置配置项的时候
  // 就会有一个独一无二的dep
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)  // 获取对象的属性的配置
  if (property && property.configurable === false) {
    // 如果这个属性的配置项存在并且是不可配置的话，那么我们就不能对其进行配置
    return
  }

  // cater for pre-defined getter/setters
  // 缓存getter和setter方法
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    // 第二个参数比较好理解，就是如果传入的参数只有两个的时候，也就是val没有获取值的时候，我们要对其进行初始化。
    // 但是第一个参数就比较费解了。
    // !getter 就是这个getter方法是没有缓存的，也就是说开发者没有自定义getter方法，那么我们就可以直接使用obj[key]从而不会触发obj[key]的拦截器，
    // 如果没有复制任何东西给这个val的话，也就是说这个val为空，由于当属性存在原本的 getter 时在深度观测之前不会取值，
    // 所以在深度观测语句执行之前取不到属性值从而无法深度观测，第二个是为了数据安全着想，不知道用户对这个setter方法赋予什么函数，所以也就不会执行
    // setter方法的原因是：如果只有判断getter是否存在的话，当初始化完毕后，这个对象就变成了带有getter和setter方法的对象了，那么进行getter方法增加依赖的话，
    // 从而实现深度观测，这样子的话就会产生一个响应式的数据行为不一的现象。
    val = obj[key]
  }

  let childOb = !shallow && observe(val)   // 当并非浅观测并且val存在值的话，进行递归观测。
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val   // 得到之前缓存的值
      if (Dep.target) {
        // target是Dep的静态属性，这个属性的说明是：正在观测中对象，可以到observe/watcher中的get方法查看，代表这个执行这个函数的一个对象，这个getter就是那边触发的
        dep.depend()
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            // 对数组进行深度遍历添加依赖
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 进行判断值有没有发生改变，如果没有发生改变的话说明不需要进行触发依赖
      // 其中newVal !== newVal && value !== value 是为了检测NaN
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        // 进行用户传入的设置
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return   // 如果一个对象具有缓存的getter方法但是没有缓存的setter方法的时候，不会接着往下执行
      if (setter) {
        // 进行执行原本的setter方法
        setter.call(obj, newVal)
      } else {
        // 没有缓存的setter方法的时候，不会进行任何操作
        val = newVal
      }
      // 如果是深度观测的话，那么会进行深度观测对象
      childOb = !shallow && observe(newVal)
      dep.notify()  // 触发观察者对象
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 深度递归遍历数组进行添加依赖
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
