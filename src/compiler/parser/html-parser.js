/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
// console.log('class="some-class"'.match(attribute))  // 测试双引号
// console.log("class='some-class'".match(attribute))  // 测试单引号
// console.log('class=some-class'.match(attribute))  // 测试无引号
// console.log('disabled'.match(attribute))  // 测试无属性值
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*`
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being pased as HTML comment when inlined in page
const comment = /^<!\--/
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
export const isPlainTextElement = makeMap('script,style,textarea', true)    // 纯文本的标签
const reCache = {}

const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

/**
 * @description 解析html实体
 * @param value
 * @param shouldDecodeNewlines
 * @returns {*}
 */
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  // 定义常量
  const stack = []  // 这个栈来判断非一元模板是否闭合
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  let index = 0
  let last, lastTag  // lastTag就是一个非一元标签，因为只有一元标签才能进入stack

  // 进行解析循环
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {  // 如果栈顶元素不存在或者栈顶元素，但不是一个纯文本的标签（textarea, script, style）
      let textEnd = html.indexOf('<')
      if (textEnd === 0) {
        // 文本结束的位置是在0，也就是说明开头就是个标签
        // Comment: 进行判断是不是注释
        if (comment.test(html)) {
          // 如果判断这个开头是一个注释的开头，那么就要寻找第一个注释的结尾
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            // 如果这个注释的结尾存在
            if (options.shouldKeepComment) {
              // 如果应当保持注释的话，将注释的内容储存起来
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // 将模板的字符串去掉前面三个模板下标
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          // 进行过滤条一些条件注释，比如说针对于IE9的一些处理
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)  // 直接跳过doctype
          continue
        }

        // End tag:  判断是否是双元标签的闭合项，如果是的话，那么就跟栈进行匹配(这里只有右边的闭合标签才能匹配到)
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)  // 进行匹配
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            // 如果是pre或者textarea标签，并且需要忽视第一个回车符的时候，那么前进一个单位
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      if (textEnd >= 0) {
        // 如果以 < 标签开头的，并且不符合以上的内容的时候，是以 < 开头的文本，那么就要将这个文本进行提取
        // 将以 < 开头的部分截取出来
        rest = html.slice(textEnd)

        while (
          !endTag.test(rest) &&  // 如果不存在结束的标签
          !startTagOpen.test(rest) && // 如果并不是一个需要闭合的左边标签
          !comment.test(rest) && // 如果并不是一个注释
          !conditionalComment.test(rest) // 如果并不是条件注释
        ) {
          // < in plain text, be forgiving and treat it as text
          // 如果满足上述条件的话，说明这个是一个文本，并且不是变量里面的文本（也就是模板标签内部出了 {{}} 之外的内容存在 <）
          // 要忽略掉这个标签，然后继续寻找
          next = rest.indexOf('<', 1)
          if (next < 0) break  // 如果没有 < 那么就退出循环
          textEnd += next  // 文本结束的位置
          rest = html.slice(textEnd)
        }
        text = html.substring(0, textEnd)  // 以上处理后，textEnd前边就是文本，此时就可以将文本提取出来
      }

      if (textEnd < 0) {
        // textEnd其实就是 < 标签开始的地方，如果没有 < 标签的话，说明全部都是文本
        text = html
      }

      if (text) {
        // 将index推进
        advance(text.length)
      }

      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 如果栈顶元素存在并且是一个纯文本标签的话（textarea, script, style）
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      // 将这个纯文本标签的内容储存起来
      // 下面这个正则表达式很好理解，因为纯文本标签是双元标签，那么如果执行到这一步的话，这个双元标签的左半部分已经在stack中了，现在只要将这个双元标签右半部分以及两个标签中间内容提取出来
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))  // 这个也就是缓存正则表达式策略
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        /**
         * @description 这个函数的参数进行解释
         * @param all 正则表达式匹配的整个结果
         * @param text 正则表达式的第一个匹配项，也就是前面的括号，就是文本内容
         * @param endTag 正则表达式的第二个匹配项，也就是结束标签
         */
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          // 如果这个标签是一个noscript标签的话
           text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        if (options.chars) {
          options.chars(text)
        }
        // 返回值为空的，表示将整个内容替换成空的
        return ''
      })
      index += html.length - rest.length  // 将前面正则表达式的内容替换掉
      html = rest // html的部分就转为
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()  // 清除栈剩下的标签（可能是一些双标标签）

  function advance (n) {
    index += n
    html = html.substring(n)
  }

  /**
   * @description 对开始标签进行解析
   * @returns {{start: number, tagName: *, attrs: Array}}
   */
  function parseStartTag () {
    const start = html.match(startTagOpen)
    if (start) {
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        // 没有匹配到开始标签的结束部分，但是匹配到了元素的属性，那么就将这个元素上的属性进行储存
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      if (end) {
        // 判断标签的格式并且将当前字符串去除开始标签的剩余部分（空格 + > 或者 />）
        match.unarySlash = end[1]  // end[1]这个标签有两种情况，一种是/；另外一种是空字符串，如果是/的情况下是一个一元标签。
        advance(end[0].length)
        match.end = index

        return match
      }
      // 如果没有匹配到闭合标签，说明这个开头一定不是一个标签，那么就返回undefined
    }
  }

  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash  // 匹配项是否存在是一个单元标签（也就是以/>为结尾的标签）

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        // 栈顶是p，并且这个tagName是需要左右进行闭合的标签
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash  // 如果是一元标签的话，那么就为true，如果不是一元标签，那么就返回开始标签是否闭合
    const l = match.attrs.length  // 属性的个数
    const attrs = new Array(l)
    // 在这里之前，attrs就是一个数组，这个数组是通过正则表达式匹配出来的数组，在这里对数组进行遍历，提取正则匹配出来的标签的属性键值
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      // console.log('args', args);
      const value = args[3] || args[4] || args[5] || ''  // 获取属性值
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)  // 模板字符内容进行解码
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    if (!unary) {
      // 如果不是一元标签并且左边的开始标签不是闭合的，那么一定要有一个匹配的标签，所以把这个标签名放进stack中
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName  // lastTag始终指向栈顶
    }

    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  /**
   *
   * @param tagName 标签名称
   * @param start 标签在字符串的起始位置
   * @param end 标签名字在字符串的终止位置
   */
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      // 按逻辑思维只需要栈顶进行匹配就行了，但是在框架中要提示用户在哪里出错了，所以这个循环就是来进行校错的
      for (pos = stack.length - 1; pos >= 0; pos--) {
        // 在栈中寻找与之相同的tag
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      // 如果没有提供一个tagName的话，那么pos为0
      pos = 0
    }

    if (pos >= 0) {
      // 没有传进来标签名或者找到了闭合标签在stack中相应的位置
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          // 当与标签匹配的项并不在栈顶的时候，理所当然就是没有匹配好，此时要进行报错
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      stack.length = pos  // 将栈顶出栈  || 如果传进来的tagName是一个空值的话，那么就进行清空栈
      lastTag = pos && stack[pos - 1].tag // 然后将最栈顶最后一个元素赋值到lastTag
    } else if (lowerCasedTagName === 'br') {
      // </br></p>两个标签都能被匹配到
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') {
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
