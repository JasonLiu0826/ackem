/** 壳内 GUI 直接打本机编程核心，不走页面自己的开发服务器代理。 */
const API = 'http://127.0.0.1:8787'

const orig = window.fetch.bind(window)

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('/api')) {
    return orig(API + input, init)
  }
  if (input instanceof URL && input.pathname.startsWith('/api') && input.origin === location.origin) {
    return orig(API + input.pathname + input.search, init)
  }
  return orig(input as RequestInfo, init)
}
