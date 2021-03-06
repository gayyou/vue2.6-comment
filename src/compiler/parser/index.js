/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

export const onRE = /^@|^v-on:/
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\./
  : /^v-|^@|^:/
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/   // 这个是捕获迭代器的 比如   v-for="obj in a" 的时候，捕获的是  obj in a部分
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/  // 在前面的捕获迭代器的基础上对第一组捕获内容进行分析，比如  v-for="(obj, index) in a" ，
                                                               // 首先由AliasRe进行捕获 obj, index,再由这个来将obj, index分开
                                                               // 但是如果遇到(obj, key, index) in a 的话，能匹配到key 和index，这是为了后面进行过滤作用
const stripParensRE = /^\(|\)$/g  // 匹配括号，也就是上面的迭代器的括号进行去除
const dynamicArgRE = /^\[.*\]$/   // 搜集中括号的内容，无匹配项，也就是包括中括号也被搜集了

const argRE = /:(.*)$/    // 搜集事件绑定，比如 :click.stop，其中匹配项就是.stop
export const bindRE = /^:|^\.|^v-bind:/    // 搜集bind选项
const propBindRE = /^\./   // 搜集传调用变量的属性
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g  // 捕捉修饰符

const slotRE = /^v-slot(:|$)|^#/   // 捕捉v-slot

const lineBreakRE = /[\r\n]/  // 匹配空行
const whitespaceRE = /\s+/g   // 匹配空格

const invalidAttributeRE = /[\s"'<>\/=]/  // 非法的属性值

const decodeHTMLCached = cached(he.decode)  // 将HTML进行解码，比如 &#x26; -> '&'

export const emptySlotScopeToken = `_empty_`

// configurable state
// 定义平台的一些状态
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

/**
 * @description 返回一个抽象语法树的节点
 * @param tag
 * @param attrs
 * @param parent
 * @returns {{parent: (ASTElement|void), children: Array, attrsMap: Object, attrsList: Array<ASTAttr>, rawAttrsMap: {}, tag: string, type: number}}
 */
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,  // 类型
    tag,  // 标签名
    attrsList: attrs,  // 所有属性的列表，（对象列表，对象的两个属性分别是name和value）
    attrsMap: makeAttrsMap(attrs),  // 将attrs中的列表的每一项的name作为键，value作为值生成散列表
    rawAttrsMap: {},  // 将value值通过JSON.stingify进行字符串化
    parent,  // 父节点
    children: []  // 子节点
  }
}

/**
 * Convert HTML string to AST.
 * 将html字符串转了AST
 */
export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  // no是一个回调函数，这个函数无论传什么东西都是返回false
  platformIsPreTag = options.isPreTag || no   // 判断是否是pre标签
  platformMustUseProp = options.mustUseProp || no  // 判断是否必须使用props属性
  platformGetTagNamespace = options.getTagNamespace || no  // 得到标签的命名空间
  // console.log(platformGetTagNamespace)
  const isReservedTag = options.isReservedTag || no   // 是否是保留的标签
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)   // 可能是组件？？？


  transforms = pluckModuleFunction(options.modules, 'transformNode')   // 对标签上的类名或者style名进行处理
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')  // 对input标签进行处理的函数
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')  // 偏移后
  // console.log('post', postTransforms)

  delimiters = options.delimiters  // 分隔符
  // console.log(delimiters)
  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false  // 是否保留空白
  const whitespaceOption = options.whitespace  // 对于空白选项的配置
  let root
  let currentParent   // 当前节点的父节点
  let inVPre = false  // 判断当前检验标签有无v-pre属性
  let inPre = false   // 判断当前标签是否为pre标签
  let warned = false

  function warnOnce (msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }

  // 闭合标签
  function closeElement (element) {
    trimEndingWhitespace(element)  // 去掉末尾空白的区域
    if (!inVPre && !element.processed) {
      // 如果父节点并没有 v-pre 属性并且这个树状节点还没有被processed过，那么就进行processElement
      element = processElement(element, options)
    }
    // tree management
    // 语法树栈为空，并且当前元素不是根元素，说明根元素并非只有一个。
    // 因为root从头到尾只有在遇到第一个元素的时候赋值，但是stack可以为空几次。（因为根节点不止一个。并且进行遍历树的时候，在进入节点内部的时候会将父节点进行推进栈）
    // 只要栈为空，说明到了顶层节点。当顶层节点并不是一开始设定的root的时候，说明顶层节点不止一个
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        warnOnce(
          `Component template should contain exactly one root element. ` +
          `If you are using v-if on multiple elements, ` +
          `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }

    // 如果当前访问的空间是一个ast的子节点并且不是禁止的子节点的情况下
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        // 对条件进行处理
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          // 如果遇到了scope-slot属性的时候，说明是一个作用域插槽
          const name = element.slotTarget || '"default"';  // 获取插槽的名字
          (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element  // 将父容器的的scopedSlots推进本节点，这样父节点就能够访问子节点的数据了
        }
        // 进行相互绑定
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    // 前面已经将作用域插槽放到父节点的属性中了，现在就无需将作用域插槽节点放到子节点中
    // TODO 如果这里将作用域插槽给去掉，那么怎么定义插槽在子节点中的位置？？？  插槽两个特性：内容由父节点进行定义，位置由子节点进行定义。那么这个位置如何处理
    // TODO 已知，在这里的时候，作用域插槽的父节点已经指向currentParent
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    // 闭合标签后，之前存在的状态也要进行复原
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // 对结尾的空白节点进行去除
  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 &&
        lastNode.text === ' '
      ) {
        el.children.pop()
      }
    }
  }

  //
  function checkRootConstraints (el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.',
        { start: el.start }
      )
    }
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  // 解析HTML
  // TODO 这里面的start、end、chars、comment都是在词法解析模板的时候，遇到左半部分标签、右半部分标签、字符、注释分别调用start、end、chars、comment进行同步构建语法树
  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    /**
     *
     * @param tag 标签名
     * @param attrs 属性列表
     * @param unary 是否是可以作为一元标签使用
     * @param start 在template中起始的位置
     * @param end  在template中终止的位置
     */
    start (tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      // 可以根据代码推测这个ns就是currentParent标签的名字
      // ns 我目前是这么理解的，就是获得当前容器的父节点的标签名
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)  // 如果父节点在的话，那么就获取父节点的标签名字。如果父节点不在的话，那么就真针对于svg、math标签进行获取标签名
      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        // 处理IE的svgBug
        attrs = guardIESVGBug(attrs)
      }

      let element: ASTElement = createASTElement(tag, attrs, currentParent)  // 根据标签名，属性，父节点进行创建抽象树元素
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        if (options.outputSourceRange) {
          // 这个outputSourceRange也是进行当前执行环境的判断
          element.start = start
          element.end = end
          // 将所有属性都设定到一个对象中，返回给rawAttrsMap
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }

        attrs.forEach(attr => {
          // 进行判断attr名是否是非法的
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
              `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }


      if (isForbiddenTag(element) && !isServerRendering()) {
        // 如果是style、script标签的话，那么是没有办法进行解析的，所以在非生产环境下会进行报错
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.',
          { start: element.start }
        )
      }

      // apply pre-transforms
      // TODO 这里是对input标签的v-if-else链进行处理
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      if (!inVPre) {
        // 这个标签没有使用v-pre
        processPre(element)  // 如果这个元素存在v-pre属性的话，将这个属性去掉，并且将element.pre设为true
        if (element.pre) {
          // 如果前面条件满足的话，那么将inVpre设为true.接下来就是针对于这种情况进行处理
          inVPre = true
        }
      }

      if (platformIsPreTag(element.tag)) {
        // 判断平台上这个标签是否是pre标签，如果是的话，就进入了inPre为真的状态
        inPre = true
      }

      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        processFor(element)
        processIf(element)
        processOnce(element)
      }

      if (!root) {
        root = element
        if (process.env.NODE_ENV !== 'production') {
          // 进行检验渲染的根节点是否符合有且只有一个并且不能是template
          checkRootConstraints(root)
        }
      }

      // 并非单元标签,此时这个坐标很可能会作为其他坐标的父坐标
      if (!unary) {
        currentParent = element
        // 非单元标签，需要先入栈，后面等到遇到结束标签的时候再出栈处理
        stack.push(element)
      } else {
        // 将单元标签进行闭合（假装闭合，因为单元标签的话，是没有左右闭合标签的）
        closeElement(element)
      }
    },

    /**
     *
     * @param tag 标签名
     * @param start 该标签名在html字符串中起始的位置
     * @param end 改标签在html字符串中终止的位置
     */
    end (tag, start, end) {
      // 遇到结束标签的时候
      const element = stack[stack.length - 1]
      // pop stack
      stack.length -= 1  // 出栈
      currentParent = stack[stack.length - 1] // 并且更改当前父节点坐标。这个currentParent也就是最靠近现在处理的所处环境最靠近的父容器
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }
      closeElement(element)  // 对于双元标签的话，进行闭合标签的操作
    },

    /**
     *
     * @param text 普通文本内容
     * @param start 在html中开始的位置
     * @param end 在html中结束的位置
     */
    chars (text: string, start: number, end: number) {
      if (!currentParent) {
        // 当前没有一个父容器包着，仅仅只有纯文本的时候，进行报错
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            // 去除空格
            warnOnce(
              `text "${text}" outside root element will be ignored.`,
              { start }
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      // 处理IE的placeholder错误
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      if (inPre || text.trim()) {
        // 在pre标签或者文字去除两端空格后还是存在的
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)  // 如果父容器不是style或者script标签，那么进行编码.这样做的目的就是为了接下来的内容不会被词法解析器看做是一个标签，从而避免生成语法树节点从而造成错误
      } else if (!children.length) {
        // 父容器的抽象语法树节点不存在字节点的话
        // TODO 这里有点问题
        // remove the whitespace-only node right after an opening tag
        // 这里要记住，js从来都是传值传参的，基本数据类型的话，也就是copy一份，对象类的话是复制地址后传参。所以这里只是本地修改值
        text = ''
      } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }
      if (text) {
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        let res
        let child: ?ASTNode
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          child = {
            type: 3,
            text
          }
        }
        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },

    /**
     *
     * @param text 注释内容
     * @param start 注释在字符串的起始位置
     * @param end 注释在字符串的终止位置
     */
    comment (text: string, start, end) {
      // adding anyting as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      if (currentParent) {
        const child: ASTText = {
          type: 3,
          text,
          isComment: true
        }
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          child.start = start
          child.end = end
        }
        currentParent.children.push(child)
      }
    }
  })
  return root
}

// 进行设置v-pre标签，并将结果给
function processPre (el) {
  // 把pre的值从ast的节点上移除，主要处理的是attrs和attrMap
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

// attrs用键值对，并且值为字符串显示出来
function processRawAttrs (el) {
  const list = el.attrsList
  const len = list.length
  if (len) {
    const attrs: Array<ASTAttr> = el.attrs = new Array(len)
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    // 并没有任何属性
    el.plain = true
  }
}

export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  // 纯树抽象树结构的定义是以下：没有属性列表、没有key、没有作用域插槽
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )

  processRef(element)
  processSlotContent(element)
  processSlotOutlet(element)
  processComponent(element)
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  processAttrs(element)
  return element
}

/**
 * 对于循环渲染的key值的处理策略是不能够放到template标签上面
 * @param el
 */
function processKey (el) {
  const exp = getBindingAttr(el, 'key')  // 得到 v-bind 或者 : 开头的key属性
  if (exp) {
    if (process.env.NODE_ENV !== 'production') {
      if (el.tag === 'template') {
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          getRawBindingAttr(el, 'key')
        )
      }
      // 如果是在循环渲染的时候
      if (el.for) {
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
            `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    el.key = exp
  }
}

/**
 * @description 处理策略是判断这个容器上是否使用  v-bind 或者 : 进行绑定的ref，注意，只有v-bind 或 : 才能检测到，否则将不会进行检测
 * @param el
 */
function processRef (el) {
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    el.refInFor = checkInFor(el)
  }
}

/**
 * @description 思路是将列表循环渲染的内容进行提取，然后存储到el上面去
 * @param el 抽象语法树的节点
 */
export function processFor (el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {

    const res = parseFor(exp)  // 返回一个对象，这个对象有alias是迭代值、键、下标。还有被访问的对象
    if (res) {
      extend(el, res)  // 将res的内容扩展到el上面去
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

/**
 *
 * @param exp
 */
export function parseFor (exp: string): ?ForParseResult {
  const inMatch = exp.match(forAliasRE)  // 进行获取迭代正文部分
  if (!inMatch) return
  const res = {}
  res.for = inMatch[2].trim()  // 进行获取被迭代的对象部分
  const alias = inMatch[1].trim().replace(stripParensRE, '')  // 获取前面内容 in 前面的内容，如果有括号就去除括号

  const iteratorMatch = alias.match(forIteratorRE)   // 对迭代器前面的括号内容进行判断
  if (iteratorMatch) {
    // 说明迭代器存在不止一个item，还有index等等
    res.alias = alias.replace(forIteratorRE, '').trim()  // 将获取到的内容只保留第一个下标
    res.iterator1 = iteratorMatch[1].trim()  // 如果() in obj 括号内有三个选项的话，就是迭代的键值，如果括号只有两个项的话，那么就是迭代下标的名字
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim()  // 一定是迭代下标
    }
  } else {
    res.alias = alias  // 迭代value值
  }
  return res
}

/**
 * @description 对标签上的v-if-else-else-if进行提取并且放到抽象语法树中
 * @param el
 */
function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if')  // 对v-if内容进行处理
  if (exp) {
    // 如果存在提取内容，给抽象语法树进行添加if属性
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)  // 找到这个节点前的节点
  if (prev && prev.if) {
    // 查询结果存在，并且前面的节点有v-if属性的话，那么就将这个v-else节点添加到前面的if节点中，左右elseif的属性
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

/**
 * @description 思路很简单，因为这个函数调用的时候还是正在对这棵树进行添加节点，所以当前访问的就是parent.children的最后一个节点，那么前一个就是children.length - 1.
 * 这里还会对v-if v-else 中间是否有没有条件属性的节点进行判断，如果有的话，就进行忽略
 * @param children
 * @returns {*}
 */
function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}

// 添加if条件判断筐
export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

/**
 * @description 进行提取once属性
 * @param el
 */
function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

/**
 * @description 对插槽的父组件中的插槽内容进行处理，插槽可以在template和其他标签上使用
 * 在template上存在scope，则进行提示，但是不影响使用；如果是其他元素使用作用域插槽的话，并且存在v-for的情况下进行提示
 * @param el
 */
// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">
function processSlotContent (el) {
  let slotScope
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope')  // 提取scope，如果存在的时候进行把偶偶
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
        `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
        `can also be used on plain elements in addition to <template> to ` +
        `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')  // 但是还是能够进行使用
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
        `(v-for takes higher priority). Use a wrapper <template> for the ` +
        `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    el.slotScope = slotScope
  }

  // slot="xxx"
  const slotTarget = getBindingAttr(el, 'slot')
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  if (process.env.NEW_SLOT_SYNTAX) {
    if (el.tag === 'template') {
      // v-slot on <template>
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              `<template v-slot> can only appear at the root level inside ` +
              `the receiving the component`,
              el
            )
          }
        }
        const { name, dynamic } = getSlotName(slotBinding)
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        el.slotScope = slotBinding.value || emptySlotScopeToken // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (!maybeComponent(el)) {
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.scopedSlots) {
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
              `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding)
        const slotContainer = slots[name] = createASTElement('template', [], el)
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        slotContainer.children = el.children.filter((c: any) => {
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        el.children = []
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}

function getSlotName (binding) {
  let name = binding.name.replace(slotRE, '')
  if (!name) {
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `v-slot shorthand syntax requires a slot name.`,
        binding
      )
    }
  }
  return dynamicArgRE.test(name)
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: `"${name}"`, dynamic: false }
}

/**
 * @description 对slot标签进行处理，得到name
 * @param el
 */
// handle <slot/> outlets
function processSlotOutlet (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}

function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  // 判断这个模板是否是内联模板：内联模板可以直接像vuecli那样子放到挂载的html上
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

/**
 * @variation list list是处理过的参数，name为标签上的属性名、value为标签上的属性值
 * @param el
 */
function processAttrs (el) {
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name
    value = list[i].value
    if (dirRE.test(name)) {
      // 判断这个属性是否是动态的属性
      // mark element as dynamic
      el.hasBindings = true
      // modifiers
      modifiers = parseModifiers(name.replace(dirRE, ''))
      // support .foo shorthand syntax for the .prop modifier
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        // 如果属性名是允许使用 name.xxx 进行绑定的，那么就进行处理
        (modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        // 过滤掉修改的处理
        name = name.replace(modifierRE, '')
      }
      if (bindRE.test(name)) { // v-bind
        // v-bind处理
        name = name.replace(bindRE, '')
        value = parseFilters(value)
        isDynamic = dynamicArgRE.test(name)     // 判断获得对象的属性是否是动态的，也就是说，用中括号法来进行获取对象的属性
        if (isDynamic) {
          // 如果是动态的话，那么就中括号处理掉（处理掉首尾部分）
          name = name.slice(1, -1)
        }
        // 进行检验属性的错误
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) { // v-on
        name = name.replace(onRE, '')
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else { // normal directives
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i])
      }
    }
  }
}

/**
 * @description 处理的策略就是只要一个父容器有循环渲染的话，就返回true
 * @param el
 * @returns {boolean}
 */
function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    parent = parent.parent
  }
  return false
}

/**
 * @description 这个函数是针对于标签上的属性值是可以进行修改的情况的处理
 * @param name
 */
function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE)  // 判断这个标签的属性名是否是可以修改的  比如 :[name]  其中name为变量，这些就是可以修改的属性名
  if (match) {
    // 如果匹配到了，用散列表进行装起来
    const ret = {}
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    if (
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    map[attrs[i].name] = attrs[i].value
  }
  return map
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

// 判断某个节点是不是那种隐藏的节点
// 如果是style标签、script标签等都是隐藏节点
function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    _el = _el.parent
  }
}
