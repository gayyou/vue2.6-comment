/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

/**
 * 这个函数对Provide进行初始化
 * @param vm
 */
export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

export function initInjections (vm: Component) {
  const result = resolveInject(vm.$options.inject, vm)  // 返回一个纯对象，这个纯对象就是inject选项所定义的键+值
  if (result) {
    toggleObserving(false)  // 由于父组件可能会对inject传进来的值进行观察，那么这里就进行关闭观察者
    Object.keys(result).forEach(key => {
      // 将结果进行遍历，进行第一层的添加监听
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        // 将inject第一层的getter进行添加getter和setter
        // TODO 为什么是添加第一层？？？
        //  这是因为传进来的值，如果是一个对象的话，那么这个对象的所有键值都被父组件更新的时候已经添加的getter和setter方法了。
        //  但是这个对象在本组件中的inject对象中被引用，但是inject上面并不存在对这个对象进行getter和setter的设定。
        defineReactive(vm, key, result[key])
      }
    })
    // 恢复原来的
    toggleObserving(true)
  }
}

export function resolveInject (inject: any, vm: Component): ?Object {
  // 如果注入存在
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)   // 针对ES6进行处理

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from   // 获取inject里面传值过来的键值
      let source = vm
      while (source) {
        // 确定inject属性中当前key所提供的vm实例
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }
      if (!source) {
        // 如果没有人提供这个inject，那么类似于props传进来的属性进行获取默认值
        if ('default' in inject[key]) {

          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }
    return result
  }
}
