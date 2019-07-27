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
  template: '<span class="123" :[key]="key2" data-index="true">这个将不会改变: {{ getCount }}<span v-for="(item, key, index) in obj"></span><childs :data="a.name"></childs></span>',
  components: {
    childs: b
  },
  el: '#app',
  data() {
    return {
      key: 'name',
      key2: '321',
      c: '123',
      a: {
        name: '',
        age: 123
      },
      b: {
        age: 321
      },
      obj: {
        name: 1,
        key: 2
      },
      arr: [1, 2 , 3]
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

