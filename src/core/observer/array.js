/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)   // arrayMethos就是数组的方法比如push等等

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 * 进行遍历访问数组的方法
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]     // 获取数组的方法名
  def(arrayMethods, method, function mutator (...args) {
    // arrayMethods是从Array对象原型链继承下来的对象，在vue中所有的数组都的原型都指向这个arrayMethod对象，这是在不影响全局的情况下进行修改的。
    // 首先得到原生的方法的一个执行，并作为一个缓存。
    const result = original.apply(this, args)
    const ob = this.__ob__    // 获得对象的观察者属性
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        // push或者unshift的情况下，拿出所有的参数
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2) // 如果是splice的话，就么去除前两个参数
        // console.log('splice', inserted);
        break
    }
    if (inserted) ob.observeArray(inserted)   // 进行判断里面的下标是否有没有进行观察的，如果没有被观察则添加观察，如果有的话就不进行添加观测
    // notify change
    ob.dep.notify()     // 触发对象的依赖
    return result
  })
})
