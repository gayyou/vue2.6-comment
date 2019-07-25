/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount   // 进行缓存之前的mout
// 重新对vue的原型上面的$mount进行定义
// 这个函数式对之前挂载的mount函数进行增加编译模板的功能，
// 先将之前的方法进行缓存，然后等到最后的时候进行执行缓存并且返回缓存的值
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* istanbul ignore if */
  if (el === document.body || el === document.documentElement) {
    // 判断挂载dom节点是否是body标签或者html标签，如果是的话则进行提示
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options  // Vue对象传进来的选项合并后的配置项

  // resolve template/el and convert to render function
  if (!options.render) {
    // 当用户传进来的配置项不存在的时候
    let template = options.template
    if (template) {
      // 如果模板存在
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          // 根据id获取模板
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 如果一个template是一个dom节点的时候，直接返回这个dom节点的内容
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 没有渲染模板，挂载容器存在的话，那么返回挂载容器的内容包含描述元素及其后代的序列化HTML片段
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
      // console.log('delimiters', options, options.delimiters, options.comments)
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)  // 获取渲染方法以及静态渲染方法
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 返回缓存时候执行结果
  return mount.call(this, el, hydrating);
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 * 返回整个元素的序列化结果
 */
function getOuterHTML (el: Element): string {
  // 内容包含描述元素及其后代的序列化HTML片段
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    // 如果没有序列化的方法的话，那么会在外面创建模板并且返回整个内容
    // 实际上在 IE9-11 中 SVG 标签元素是没有 innerHTML 和 outerHTML
    // 这两个属性的，解决这个问题的方案很简单，可以把 SVG 元素放到一
    // 个新创建的 div 元素中，这样新 div 元素的 innerHTML 属性的值
    // 就等价于 SVG 标签 outerHTML 的值，而这就是上面代码中 else 语句块所做的事情。
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions
export default Vue
