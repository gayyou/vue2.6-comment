<template> 
  <div class="login-container">
    <div class="login-close"><img src="@/assets/icons/close.png" alt="" @click="closeLayer"></div>
    <div class="login-title">
      <span>欢迎回来！</span>
    </div>
    <div class="login-cutline"></div>
    <div class="login-account">
      <div class="tips" :style="$data.accIsOK ? 'opacity: 0' : 'opacity: 1'">请填写正确的手机号</div>
      <label for=""><span>手机号</span></label>
      <input id="login-account" type="text" v-model="$data.account" ref="account">
    </div>
    <div class="login-password">
      <div class="tips" :style="$data.passIsOK ? 'opacity: 0' : 'opacity: 1'">请填写正确长度的密码</div>
      <label for=""><span>密码</span></label>
      <input id="login-password" type="password" v-model="$data.password" ref="password">
    </div>
    <button class="login-button" id="login-button" @click="login">登陆</button>
  </div>
</template>

<script>
export default {
  props: ['message'],
  data() {
    return {
      account: '',
      password: '',
      accIsOK: true,
      passIsOK: true
    }
  },
  methods: {
    closeLayer(event) {
      this.$store.state.showLogin = false;
    },
    login(event) {
      let accReg = new RegExp(/^1[3456789]\d{9}$/),
          passReg = new RegExp(/^.{0,18}$/);
      
      if (!accReg.test(this.$data.account)) {
        this.$data.accIsOK = false;
        this.$refs.account.focus();
        return ;
      }
      if (!passReg.test(this.$data.password)) {
        this.$data.passIsOK = false;
        this.$refs.password.focus();
        return ;
      }

      this.$http.post('/user/login', {
        userName: this.$data.account,
        password: this.$data.password
      })
      .then((res) => {
        let data = res.data;
        switch(data.code) {
          case '200': {
            if (data.data) {
              this.$store.state.message = '登陆成功'
              this.$store.state.userID = data.data.id;
              this.$store.state.userName = data.data.userName;
              this.$store.state.name = data.data.name;
              this.$store.state.isLogin = true;
              this.$store.state.showLogin = false;
              // 登陆成功
            } else {
              this.$store.state.message = '登陆失败,请检查你的账号和密码'
              // 登陆失败
            }
            break;
          }
          case '500': {
            this.$store.state.message = '服务器出现异常'
            break;
          }
        }
        this.$store.state.showMessage = true;
      })
      .catch((err) => {
        throw new Error(err);
      })
    }
  },
  watch: {
    account(newVal) {
      let reg = new RegExp(/^1[3456789]\d{9}$/);
      if (reg.test(this.$data.account)) {
        this.$data.accIsOK = true;
      } else {
        this.$data.accIsOK = false;
      }
      if (newVal.length > 11) {
        this.$data.account = newVal.slice(0, 11);
      }
    },
    password(newVal) {
      let reg = new RegExp(/^.{0,18}$/);
      if (reg.test(this.$data.password)) {
        this.$data.passIsOK = true;
      } else {
        this.$data.passIsOK = false;
      }
      if (newVal.length > 18) {
        this.$data.password = newVal.slice(0, 18);
      }
    }
  }
}
</script>

<style lang="scss" scoped>
%clear-float::after {
  content: "";
  display: block;
  clear: both;
}
$themeColor: #ed775a;

.login-container {

  width: 5.66rem;
  height: 5.5rem;
  background-color: #fff;
  border-radius: 36px;

  .tips {
    position: absolute;
    top: 0.45rem;
    right: -1.5rem;
    width: 1.8rem;
    padding: 0.05rem 0.1rem;
    background-color: #fff;
    transition: opacity .75s ease;
    border: 1px solid rgba($color: #000000, $alpha: 0.3);
    border-radius: 0.08rem;
    box-shadow: 0 0 8px rgba($color: #000000, $alpha: 0.1);
  }
  .tips::after {
    position: absolute;
    display: block;
    content: "";
    transform: rotate(45deg);
    left: -0.069rem;
    top: 0.12rem;
    background-color: #fff;
    width: 0.1rem;
    height: 0.1rem;
    border-left: 1px solid rgba($color: #000000, $alpha: 0.3);
    border-bottom: 1px solid rgba($color: #000000, $alpha: 0.3);
  }

  .login-close {
    width: 100%;
    height: 0.44rem;
    img {
      cursor: pointer;
      display: block;
      width: 0.44rem;
      height: 0.44rem;
      float: right;
      margin-right: 0.2rem;
      margin-top: 0.1rem
    }
  }

  .login-title {
    display: flex;
    justify-content: center;
    width: 100%;
    height: 0.8rem;
    font-family: 'HYZhuZiMuTouRen';
    font-size: 0.6rem;
    color: $themeColor;

    span {
      display: block;
      margin-left: 0.3rem;
    }
  }

  .login-cutline {
    width: 5.06rem;
    margin: 0.15rem auto 0.25rem auto;
    height: 1.5px;
    background-color: #f1f1f1;
  }

  .login-account, .login-password {
    position: relative;
    font-family: 'SourceHanSansCN-Regular';
    margin-top: 0.2rem;
    width: 100%;

    label {
      display: block;
      width: 2rem;
      margin-left: 0.2rem;
      margin-top: 0.15rem;

      span {
        font-size: 0.24rem;
        color: #373f53;
      }
    }

    input {
      width: 4rem;
      height: 0.55rem;
      margin: 0 auto;
      border-radius: 24px;
      text-indent: 0.2rem;
      border: 2px solid #f1f1f1;
      transition: all .5s ease;
      font-size: 0.24rem;
    }

    input:focus {
      border: 2px solid #F7947B;
    }

  }

  .login-password {
    label {
      margin-left: 0.1rem; 
    }
  }

  .login-button {
    font-family: 'SourceHanSansCN-Regular';
    display: block;
    font-size: 0.28rem;
    color: #fff;
    background-color: $themeColor;
    width: 2.1rem;
    height: 0.72rem;
    border-radius: 0.36rem;
    margin: 0.4rem auto;
    transition: all .5s ease;
  }
  .login-button:hover {
    opacity: 0.5;
  }
}
</style>
