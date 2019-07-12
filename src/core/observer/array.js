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
 * 思路：
 * 1. 先将之前的数组的方法进行缓存，执行数组原生的操作并且缓存下来待到最后作为返回值
 * 2. 如果是push或者unshift的话，对添加进来的对象进行添加观察者，splice也是对添加进来的对象进行添加观察者
 * 3. 返回数组原生执行的结果
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]     // 获取数组的方法名
  def(arrayMethods, method, function mutator (...args) {  // 运用es的内容，将参数全部放在一个数组里面
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
        inserted = args.slice(2) // 如果是splice的话，就么去除前两个参数，在前面执行原生的去除第一第二个参数的内容。
        break
    }

    if (inserted) ob.observeArray(inserted)   // 对inserted这个数组进来的内容进行添加观察者
    // notify change
    ob.dep.notify()     // 触发对象的依赖
    return result       // 返回执行的内容，我们这个函数只是对添加的内容进行添加观察，而不会对原本的数组的该方法产生任何影响
  })
})
