/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  directives,
  isPreTag,   // 检查是否是`pre`标签
  isUnaryTag,  // 检查是否是一元标签
  mustUseProp,  // 检查一个标签是否要使用props进行绑定
  canBeLeftOpenTag,  // 一些双标签，即这个标签是需要闭合的，但是可以不输入闭合，会自动生成闭合
  isReservedTag,  // 是否是保留的标签
  getTagNamespace,  // 获得标签的命名空间
  staticKeys: genStaticKeys(modules)  // 静态标签，根据modules生成静态属性
}
