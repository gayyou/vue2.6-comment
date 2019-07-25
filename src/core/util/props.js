/* @flow */

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

export function validateProp (
  key: string,
  propOptions: Object,  // 本组件中props选型的内容
  propsData: Object,    // 外界传进来的propsData组件
  vm?: Component
): any {
  const prop = propOptions[key]
  const absent = !hasOwn(propsData, key)   // 外界传给本组件的数据是否不存在
  let value = propsData[key]
  // boolean casting
  // TODO 以下的代码串是专门针对于传进来的bool值进行校验，如果设置子组件的某个属性一定要是boolean，但是传进来的是string类型的话，根据情况转为boolean
  const booleanIndex = getTypeIndex(Boolean, prop.type)  // 给出一个类型的数组，得出这个类型在这个数组的下标。如果给出的prop.type是其他数据类型的话。如果找得到返回0，否则返回-1
  if (booleanIndex > -1) {
    // 说明是Boolean类型是存在于prop.type的
    if (absent && !hasOwn(prop, 'default')) {
      // 如果这个propsData没有key这个属性，并且prop中也没有default配置项的话，那么设value为false
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      // 仅仅当boolean，仅仅针对于空字符串或者名字和键名相同的字符串转为true
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }
  // check default value
  if (value === undefined) {
    // 如果这个值是没有传进来的，说明需要使用default的值，首先是得到这个default的值
    value = getPropDefaultValue(vm, prop, key)
    // since the default value is a fresh copy,
    // make sure to observe it.
    const prevShouldObserve = shouldObserve  // 缓存之前的状态
    /**
     * 开启观察者，前提条件就是父组件没有传进来这个值，所以要对这个默认的值进行观察
     * 可以理解为相当于一个data的数据，需要进行观察
     */
    toggleObserving(true)  // 让这个对象的属性能够被观察
    observe(value)    // 观察这个值的变化，以便父容器对这个值进行改变的时候，进行触发相应的操作
    toggleObserving(prevShouldObserve)    // 将状态调整为刚刚缓存的状态
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }
  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined

  if (!hasOwn(prop, 'default')) {
    // 如果没有设置default属性，并且这个属性是没有传进来的时候，那么就返回空
    return undefined
  }
  const def = prop.default  // 缓存default属性
  // warn against non-factory defaults for Object & Array
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    // 设置的default必须是个函数而且将default值作为返回值
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }
  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger
  if (vm && vm.$options.propsData &&  // propsData存在的前提条件
    vm.$options.propsData[key] === undefined &&  // 父组件传过来的值或者上一次缓存的值为空的时候
    vm._props[key] !== undefined  // 如果vm实例内部的props的值不是空的时候，就进行返回 TODO 这里执行的时候是再次更新组件的时候用到的，而不是创建的时候用到的
  ) {
    return vm._props[key]  // 返回该属性上一次的的default的值
  }
  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def  // 返回值
}

/**
 * Assert whether a prop is valid.
 * 这个是真正检测某个值是否存在的函数
 */
function assertProp (
  prop: PropOptions,  // 子组件中option配置项
  name: string, // key键值名
  value: any, // props中父组件传进来的prop对象对应的key值
  vm: ?Component, // 实例
  absent: boolean  // 是否不存在这个值
) {
  if (prop.required && absent) {
    // 如果这个属性是必须要传进来的，但是没有在父组件中传进来的时候，就报错
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }
  if (value == null && !prop.required) {
    return  // 如果这个值是空，并且不是需要的，那么就不需要后续进行检测类型了
  }
  let type = prop.type  // 获取类型
  let valid = !type || type === true  // 如果type中没有进行设置（为undefined）则任意类型都是可以的。或者type设为true，也就是任意类型是可以的
  const expectedTypes = []  // 期望的类型的数组
  if (type) {
    if (!Array.isArray(type)) {
      type = [type]  // 如果这个type并不是一个数组的话，转为一个数组（类型可能是一个数组，也可能是一个对象）
    }
    // TODO 注意一下这个for循环的第二个条件
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i])  // 对类型进行检测，返回相对应的类型
      expectedTypes.push(assertedType.expectedType || '')  // 将期望的类型进行推进数组
      valid = assertedType.valid  // 更新某个数据是否有效，然后进行报错的就是在这个循环之后，为什么要这么做？这是因为只要有一个类型是对得上就ok了（注意这个循环的条件），如果全部对不上就要进行报错。
    }
  }

  if (!valid) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }
  const validator = prop.validator  // 这个是用户进行自主配置的选项进行判断类型,用户可以自定义检测类型
  if (validator) {
    // console.log('test', validator(value))
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol)$/

function assertType (value: any, type: Function): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  const match = fn && fn.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (expectedTypes.length === 1 &&
      isExplicable(expectedType) &&
      !isBoolean(expectedType, receivedType)) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

function isExplicable (value) {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
