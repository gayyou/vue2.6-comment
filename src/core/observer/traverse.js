/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 * 递归遍历一个对象以唤起所有转换的getter，以便将对象内的每个嵌套属性收集为“深度”依赖项。
 */
export function traverse (val: any) {
  // _traverse方法思路很简单，就是深度递归遍历这个对象所有的子对象子节点，然后
  _traverse(val, seenObjects)
  // 递归遍历结束后要讲这个seenObjects进行清除，以便下一个对象进来递归遍历
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  if ((!isA && !isObject(val))    // 不是数组也不是对象的时候
      || Object.isFrozen(val)     // 被冻结的对象
      || val instanceof VNode     // 是一个VNode的子类实例
     ) {
    // 不做任何处理
    return
  }
  if (val.__ob__) {
    // 这个值是被观察了
    const depId = val.__ob__.dep.id   // 获取观察id
    if (seen.has(depId)) {
      // 如果seen中具有这个id，则不做任何处理，不做处理的原因是已经使用了get方法触发了依赖的添加了，无需再进行触发
      return
    }
    // 为seen添加深度观察
    seen.add(depId)
  }
  if (isA) {
    // 如果是数组的话，那么进行深度获取所有的值以便进行依赖的添加
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    // 递归深度触发所有的键值对象
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
