/**
 * 面板与 host 之间那条回环路由的路径。
 *
 * 单独成文件是因为两半都要用它：host 的 [route.js](./route.js) 拿它注册，client 的
 * 面板拿它 `fetch`。而 `route.js` 自己 import 了 `node:fs`，进不了浏览器那份包。
 */

/** `GET`/`POST` 都在这一条路径上。 */
export const HARNESS_CONFIG_ROUTE = '/operation-improve/harness-config'
