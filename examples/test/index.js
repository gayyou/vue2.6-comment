let b = {
  template: '<span data-name="123">这个将不会改变: {{ data }}</span>',
  data() {
    return {}
  },
  inject: ['index'],
  props: {
    data: {
      type: Boolean
    }
  },
  mounted() {
    console.log(this);
  }
};


let a = new Vue({
  provide: {
    index: 1
  },
  template: '<span class="123" data-index="true">这个将不会改变: {{ getCount }}<childs :data="a.name"></childs></span>',
  components: {
    childs: b
  },
  el: '#app',
  data() {
    return {
      c: '123',
      a: {
        name: '',
        age: 123
      },
      b: {
        age: 321
      },
    }
  },
  watch: {
    // 'a'(newVal) {
    //   console.log(123)
    // }
  },
  computed: {
    getCount() {
      return 222
    }
  },
  mounted() {
    this.a.name = ''
    this.b.age = 11111111
  }
})

