# Claude 渠道 User-Agent 转发问题排查与解决方案

## 问题背景

在使用 new-api 作为中转网关时，遇到如下场景：

- **上游渠道**：仅支持 Claude Code 调用（通过 User-Agent 识别）
- **客户端**：使用 Claude Code 配置中转服务地址，或使用 OpenAI 协议调用
- **问题**：无法正常调用上游渠道

## 根本原因

### 问题 1：User-Agent 请求头未转发

**代码分析：**

在 `relay/channel/api_request.go` 的 `SetupApiRequestHeader` 函数中：

```go
func SetupApiRequestHeader(info *common.RelayInfo, c *gin.Context, req *http.Header) {
	if info.RelayMode == constant.RelayModeAudioTranscription || info.RelayMode == constant.RelayModeAudioTranslation {
		// multipart/form-data
	} else if info.RelayMode == constant.RelayModeRealtime {
		// websocket
	} else {
		req.Set("Content-Type", c.Request.Header.Get("Content-Type"))
		req.Set("Accept", c.Request.Header.Get("Accept"))
		if info.IsStream && c.Request.Header.Get("Accept") == "" {
			req.Set("Accept", "text/event-stream")
		}
	}
}
```

**关键问题：**
- 默认情况下，**只转发** `Content-Type` 和 `Accept` 请求头
- `User-Agent` 不在默认转发列表中
- 客户端的 `User-Agent` 会在中转时丢失

**设计原因：**
- 出于安全考虑，避免无意中泄露客户端信息
- 需要通过"请求头覆盖"机制显式配置才会转发

### 问题 2：客户端 IP 地址处理

**结论：上游渠道获取到的是中转服务的 IP，而不是客户端的真实 IP**

**原因：**
1. new-api 不会自动设置 `X-Forwarded-For`、`X-Real-IP` 或 `X-Client-IP` 等请求头
2. HTTP 请求是从 new-api 服务器发出的，TCP 连接的源 IP 就是中转服务的 IP
3. 透传机制（`"*": ""`）只会透传**客户端发送给 new-api 的请求头**
   - 如果客户端没有发送这些 IP 相关的头，就不会有任何 IP 头被透传
   - 即使透传了客户端的 `X-Forwarded-For`，那也只是客户端声称的 IP，不是实际连接 IP

**代码证据：**
- 项目中没有找到自动添加 `X-Forwarded-For` 等头的逻辑
- `c.ClientIP()` 只在 new-api 内部使用（日志、审计、限流等），不会传递给上游

---

## 解决方案

### 场景 1：Claude Code 调用中转服务

**需求：**
- 客户端是 Claude Code
- 需要透传 Claude Code 的 User-Agent 给上游

**配置方法：**

在渠道的"请求头覆盖"字段中填写：

```json
{
  "User-Agent": "{client_header:User-Agent}"
}
```

**说明：**
- `{client_header:User-Agent}` 会提取客户端的 User-Agent 并转发给上游
- 上游会识别到请求来自 Claude Code，允许通过

---

### 场景 2：非 Claude Code 客户端调用（OpenAI 协议）

**需求：**
- 客户端使用 OpenAI SDK/协议调用中转服务
- 上游渠道只允许 Claude Code 调用
- 需要伪装成 Claude Code

**配置方法：**

在渠道的"请求头覆盖"字段中填写：

```json
{
  "User-Agent": "claude-cli/2.1.172 (external, cli)"
}
```

或更新到最新版本：

```json
{
  "User-Agent": "claude-cli/3.0.0 (external, cli)"
}
```

**说明：**
- 固定设置 User-Agent 为 Claude Code 的标识
- 无论客户端用什么工具（curl、Postman、OpenAI SDK 等），上游都会认为是 Claude Code 调用
- new-api 会自动处理 OpenAI → Claude 协议转换

---

### 场景 3：透传所有请求头

**需求：**
- 希望透传客户端的所有请求头
- 同时保留覆盖某些特定请求头的能力

**配置方法：**

```json
{
  "*": "",
  "User-Agent": "claude-cli/2.1.172 (external, cli)",
  "Authorization": "Bearer {api_key}"
}
```

**执行顺序：**
1. 先应用透传规则（`"*"`）：复制客户端的所有请求头（除安全限制列表）
2. 再应用显式覆盖：覆盖 `User-Agent` 和 `Authorization`

**最终效果：**
- 客户端的其他请求头（如 `X-Request-ID`、`X-Trace-ID` 等）被保留
- `User-Agent` 和 `Authorization` 被强制覆盖为指定值

---

### 场景 4：选择性透传（使用正则表达式）

**需求：**
- 透传大部分请求头
- 但排除 IP 相关的请求头（`X-Forwarded-For`、`X-Real-IP` 等）

**方法 1：正向匹配（只透传指定的）**

```json
{
  "regex:^(User-Agent|Accept|Content-Type|X-Request-ID|X-Trace-.*)$": "",
  "User-Agent": "claude-cli/2.1.172 (external, cli)"
}
```

**方法 2：反向匹配（排除特定的）**

```json
{
  "regex:^(?!X-Forwarded-For$|X-Real-IP$|X-Client-IP$)": ""
}
```

**说明：**
- `regex:^(?!...)` 使用负向前瞻，匹配所有**不是**指定名称的请求头
- Go 正则引擎基于 RE2，支持大部分标准正则语法

---

## 透传请求体 vs 请求头覆盖

### 什么是"透传请求体"？

**透传请求体**（Pass Through Body）是渠道设置中的一个开关选项，存储在 `setting` 字段的 `pass_through_body_enabled` 属性中。

**功能说明：**

当启用"透传请求体"后，new-api 会**跳过请求体的协议转换和参数处理**，直接将客户端发送的原始请求体转发给上游。

### 透传请求体的工作机制

#### 未启用透传请求体（默认行为）

```
客户端请求（OpenAI 格式）
    ↓
new-api 解析请求体
    ↓
协议转换（OpenAI → Claude）
    ↓
参数过滤（RemoveDisabledFields）
    ↓
参数覆盖（ApplyParamOverride）
    ↓
重新序列化为 JSON
    ↓
发送到上游
```

#### 启用透传请求体后

```
客户端请求（任意格式）
    ↓
new-api 直接读取原始请求体
    ↓
不做任何转换和处理
    ↓
直接发送到上游
```

### 代码实现位置

**条件判断：**

```go
if model_setting.GetGlobalSettings().PassThroughRequestEnabled || 
   info.ChannelSetting.PassThroughBodyEnabled {
    // 使用原始请求体
    storage, err := common.GetBodyStorage(c)
    requestBody = common.ReaderOnly(storage)
} else {
    // 进行协议转换
    convertedRequest, err := adaptor.ConvertClaudeRequest(c, info, request)
    // ... 序列化、参数过滤、参数覆盖等
}
```

**相关文件：**
- `relay/compatible_handler.go`
- `relay/claude_handler.go`
- `relay/gemini_handler.go`
- `relay/image_handler.go`
- `relay/rerank_handler.go`
- `relay/responses_handler.go`

### 透传请求体 vs 请求头覆盖的区别

| 维度 | 透传请求体 | 请求头覆盖 |
|------|-----------|----------|
| **作用对象** | HTTP 请求体（Body） | HTTP 请求头（Headers） |
| **配置位置** | 渠道设置 → 透传请求体开关 | 渠道设置 → 请求头覆盖（JSON 配置） |
| **存储字段** | `setting.pass_through_body_enabled` | `header_override` |
| **作用范围** | 所有请求都透传原始请求体 | 精细控制每个请求头的转发和覆盖 |
| **协议转换** | **跳过**协议转换 | 不影响协议转换 |
| **参数处理** | **跳过**参数过滤和覆盖 | 不影响请求体处理 |
| **典型用途** | 上游 API 完全兼容客户端协议 | 设置 User-Agent、追踪头等 |

### 何时使用透传请求体

#### ✅ 适用场景

1. **上游 API 完全兼容客户端协议**
   - 客户端用 OpenAI 协议，上游也是 OpenAI 兼容的
   - 不需要任何协议转换

2. **需要传递 new-api 不支持的特殊参数**
   - 某些实验性参数或厂商特有参数
   - new-api 的协议转换可能会过滤掉

3. **绕过参数过滤和覆盖逻辑**
   - 需要完全控制发送到上游的参数
   - 不希望 new-api 修改任何请求内容

#### ❌ 不适用场景

1. **需要协议转换**
   - 客户端用 OpenAI 协议，上游是 Claude API
   - **必须关闭透传请求体**，否则上游会拒绝请求

2. **需要参数覆盖功能**
   - 使用了"参数覆盖"配置
   - 透传请求体会跳过参数覆盖逻辑

3. **需要参数过滤**
   - 需要过滤 `service_tier`、`store` 等敏感参数
   - 透传请求体会跳过参数过滤

### 透传请求体对 User-Agent 的影响

**重要：透传请求体只影响请求体，不影响请求头！**

- ✅ 即使启用了"透传请求体"，"请求头覆盖"配置**仍然生效**
- ✅ User-Agent 设置不受"透传请求体"开关影响
- ✅ 两个功能可以**独立使用**或**组合使用**

### 实际案例

#### 案例 1：Claude API 透传（不需要协议转换）

**场景：**
- 客户端直接用 Claude API 协议
- 上游也是 Claude API
- 希望原样转发

**配置：**
```json
// 启用透传请求体
"pass_through_body_enabled": true

// 请求头覆盖
{
  "User-Agent": "claude-cli/2.1.172 (external, cli)"
}
```

**效果：**
- 请求体原样转发，不做任何处理
- User-Agent 被设置为 Claude Code 标识
- 上游识别为 Claude Code 调用

#### 案例 2：OpenAI → Claude 协议转换

**场景：**
- 客户端用 OpenAI 协议
- 上游是 Claude API（仅允许 Claude Code）
- 需要协议转换

**配置：**
```json
// 关闭透传请求体（默认）
"pass_through_body_enabled": false

// 请求头覆盖
{
  "User-Agent": "claude-cli/2.1.172 (external, cli)"
}
```

**效果：**
- 请求体会进行 OpenAI → Claude 协议转换
- User-Agent 被设置为 Claude Code 标识
- 上游识别为 Claude Code 调用

#### 案例 3：完全透传（请求体 + 请求头）

**场景：**
- 上游 API 与客户端协议完全兼容
- 希望尽可能保持原样

**配置：**
```json
// 启用透传请求体
"pass_through_body_enabled": true

// 请求头覆盖（透传所有）
{
  "*": ""
}
```

**效果：**
- 请求体原样转发
- 所有客户端请求头都被转发（除安全限制列表）
- 最大程度保持原始请求

### 全局透传设置

除了渠道级别的 `pass_through_body_enabled`，还有一个**全局设置**：

```go
model_setting.GetGlobalSettings().PassThroughRequestEnabled
```

**优先级：**
- 如果**全局透传**启用，所有渠道都会透传请求体
- 如果**渠道级别透传**启用，只有该渠道透传请求体
- 两者是**或**的关系（任一启用即透传）

**配置位置：**
- 系统设置 → 模型设置 → 全局透传请求体开关

### 调试建议

1. **查看日志**
   - 启用 Debug 日志，查看 `requestBody: %s` 输出
   - 确认是否使用了原始请求体

2. **测试协议转换**
   - 关闭透传请求体，确认协议转换是否正常
   - 开启透传请求体，确认原始请求体是否被接受

3. **组合测试**
   - 分别测试"透传请求体"和"请求头覆盖"
   - 确认两者独立工作且可以组合使用

---

## 请求头透传机制详解

### 安全限制列表

以下请求头**永远不会**被透传（即使匹配了 `"*"` 或正则规则）：

```go
var passthroughSkipHeaderNamesLower = map[string]struct{}{
	// RFC 7230 hop-by-hop headers
	"connection":          {},
	"keep-alive":          {},
	"proxy-authenticate":  {},
	"proxy-authorization": {},
	"te":                  {},
	"trailer":             {},
	"transfer-encoding":   {},
	"upgrade":             {},

	"cookie": {},

	// Additional headers
	"host":            {},
	"content-length":  {},
	"accept-encoding": {},

	// Do not passthrough credentials by wildcard/regex
	"authorization":  {},
	"x-api-key":      {},
	"x-goog-api-key": {},

	// WebSocket handshake headers
	"sec-websocket-key":        {},
	"sec-websocket-version":    {},
	"sec-websocket-extensions": {},
}
```

**注意：**
- `User-Agent` **不在**安全限制列表中，可以透传
- `X-Forwarded-For`、`X-Real-IP` 等 IP 相关头**也不在**限制列表中，可以透传
- `Authorization` 在限制列表中，但可以通过**显式配置**覆盖

### 透传规则优先级

**执行顺序：**
1. 先应用透传规则（`"*"` 和 `"re:..."`）
2. 再应用显式覆盖（普通键值对和占位符）

**优先级：显式覆盖 > 透传规则**

**示例：**

```json
{
  "*": "",
  "User-Agent": "MyGateway/2.0"
}
```

**结果：**
- 客户端的 `User-Agent: Mozilla/5.0` 被透传
- 但立即被显式配置的 `User-Agent: MyGateway/2.0` 覆盖
- 上游最终收到：`User-Agent: MyGateway/2.0`

### 支持的占位符

#### 1. `{api_key}` - 渠道 API 密钥

```json
{
  "Authorization": "Bearer {api_key}",
  "X-API-Key": "{api_key}"
}
```

#### 2. `{client_header:<name>}` - 客户端请求头值

```json
{
  "X-Original-User-Agent": "{client_header:User-Agent}",
  "X-Request-ID": "{client_header:X-Request-ID}",
  "X-Trace-ID": "{client_header:X-Trace-ID}"
}
```

**限制：**
- 必须是**完整的值**，不能与其他文本拼接
- ✅ 正确：`"X-User-ID": "{client_header:X-User-ID}"`
- ❌ 错误：`"X-Info": "user={client_header:X-User-ID}"`

---

## 协议转换能力

### OpenAI → Claude 协议转换

new-api 完全支持 OpenAI 协议到 Claude 协议的转换：

**转换流程：**
1. 客户端发送 OpenAI 格式请求到 new-api
2. `ConvertOpenAIRequest` 函数将请求转换为 Claude 格式
3. `RequestOpenAI2ClaudeMessage` 处理消息格式转换
4. 转发到上游 Claude API
5. 响应转换回 OpenAI 格式返回给客户端

**相关代码：**
- `relay/channel/claude/adaptor.go:94` - `ConvertOpenAIRequest`
- `relay/channel/claude/relay-claude.go` - 转换逻辑实现

**支持的功能：**
- ✅ 消息格式转换（messages、role、content）
- ✅ 流式响应（stream）
- ✅ 函数调用（tools）
- ✅ 系统提示（system）

---

## 配置位置

### 在 Web 界面配置

1. 登录 new-api 管理后台
2. 进入"渠道管理"页面
3. 编辑目标渠道
4. 找到"请求头覆盖"字段（通常在高级设置区域）
5. 填写 JSON 配置
6. 保存

### 配置格式验证

使用 JSON 校验工具（如 [jsonlint.com](https://jsonlint.com)）验证格式是否正确。

---

## 常见问题

### Q1：透传 User-Agent 后，上游还是拒绝请求？

**可能原因：**
1. **配置未生效**：检查 JSON 格式是否正确
2. **上游有其他限制**：除了 User-Agent，可能还检查其他特征（如来源 IP、请求签名等）
3. **User-Agent 格式不匹配**：确认上游要求的具体格式

**排查方法：**
- 使用抓包工具（Charles、mitmproxy）查看实际发送的请求头
- 查看 new-api 日志
- 使用渠道测试功能验证配置

### Q2：能否传递客户端真实 IP 给上游？

**答案：默认不能，上游获取到的是中转服务的 IP**

**原因：**
- new-api 不会自动设置 `X-Forwarded-For` 等头
- TCP 连接是从 new-api 发起的，源 IP 就是中转服务 IP

**如果需要传递客户端 IP：**

```json
{
  "X-Forwarded-For": "{client_header:X-Forwarded-For}",
  "X-Real-IP": "{client_header:X-Real-IP}"
}
```

**但有限制：**
- 前提是客户端必须先发送这些头
- 如果客户端没有发送，就无法传递
- 对于直连客户端，通常不会有这些头

### Q3：如何全局阻止某些请求头透传？

**方案 1：不使用 `"*"`，改用正则表达式**

```json
{
  "regex:^(?!X-Forwarded-For$|X-Real-IP$|X-Client-IP$)": ""
}
```

**方案 2：修改代码（全局生效）**

在 `relay/channel/api_request.go` 的 `passthroughSkipHeaderNamesLower` 中添加：

```go
// Do not passthrough client IP headers to prevent IP spoofing
"x-forwarded-for": {},
"x-real-ip":       {},
"x-client-ip":     {},
```

### Q4：配置了透传为什么不生效？

**排查步骤：**

1. **检查 JSON 格式**
   ```bash
   # 在线验证：https://jsonlint.com
   # 或使用 jq 命令
   echo '{"User-Agent": "{client_header:User-Agent}"}' | jq .
   ```

2. **检查是否触发安全限制**
   - 查看请求头名称是否在 `passthroughSkipHeaderNamesLower` 列表中

3. **检查客户端是否发送了该请求头**
   - 使用抓包工具或浏览器开发者工具
   - 确认客户端确实发送了该请求头

4. **查看 new-api 日志**
   - 检查是否有请求头覆盖解析错误

### Q5：渠道测试时配置为什么不生效？

**原因：**

在渠道测试模式下，`{client_header:...}` 占位符会被跳过：

```go
if info.IsChannelTest && strings.HasPrefix(strings.TrimSpace(str), clientHeaderPlaceholderPrefix) {
	continue
}
```

**解决方案：**
- 渠道测试时，使用固定值而不是占位符
- 或使用真实客户端测试

---

## 技术实现细节

### 代码位置

| 功能 | 文件路径 | 函数/变量 |
|------|---------|----------|
| 请求头透传解析 | `relay/channel/api_request.go` | `processHeaderOverride()` |
| 占位符替换 | `relay/channel/api_request.go` | `applyHeaderOverridePlaceholders()` |
| 安全限制列表 | `relay/channel/api_request.go` | `passthroughSkipHeaderNamesLower` |
| 正则缓存 | `relay/channel/api_request.go` | `headerPassthroughRegexCache` |
| Claude 请求头设置 | `relay/channel/claude/adaptor.go` | `SetupRequestHeader()` |
| OpenAI→Claude 转换 | `relay/channel/claude/relay-claude.go` | `RequestOpenAI2ClaudeMessage()` |

### 执行流程

```
客户端请求
    ↓
Gin 中间件处理
    ↓
路由分发到 relay 模块
    ↓
识别目标渠道（Claude）
    ↓
协议转换（如果是 OpenAI 协议）
    ↓
SetupRequestHeader（设置基础请求头）
    ↓
processHeaderOverride（应用透传和覆盖规则）
    ↓
DoApiRequest（发送到上游）
    ↓
响应处理和转换
    ↓
返回给客户端
```

### 正则引擎

- 使用 Go 标准库 `regexp` 包（基于 RE2）
- 不支持回溯和部分 PCRE 特性
- 编译结果会缓存在 `headerPassthroughRegexCache`（`sync.Map`），避免重复编译

---

## 最佳实践

### 1. 安全建议

- ❌ **不要轻易透传 Authorization**：除非确实需要，否则不要透传客户端的认证头
- ❌ **避免透传敏感信息**：如内部 IP、调试信息等
- ✅ **使用正则时注意范围**：避免过于宽泛的匹配规则
- ✅ **最小权限原则**：只透传必要的请求头

### 2. 性能考虑

- 正则表达式会在每次请求时执行，但有缓存优化
- 复杂的正则表达式可能轻微影响性能
- 建议优先使用精确匹配或简单正则
- 透传规则（`"*"`）比正则表达式性能更好

### 3. 调试技巧

1. **使用渠道测试功能**：在渠道管理页面测试配置是否生效
2. **查看上游日志**：某些服务商（如 OpenAI）提供请求日志查看功能
3. **使用中间代理**：通过 Charles、mitmproxy 等工具抓包查看实际请求头
4. **启用 Debug 日志**：在 new-api 中启用详细日志

### 4. 推荐配置模板

#### 基础配置（仅 User-Agent）

```json
{
  "User-Agent": "claude-cli/2.1.172 (external, cli)"
}
```

#### 透传 + 覆盖

```json
{
  "*": "",
  "User-Agent": "claude-cli/2.1.172 (external, cli)",
  "Authorization": "Bearer {api_key}"
}
```

#### 追踪链路透传

```json
{
  "regex:^(X-Trace-|X-Span-|X-B3-|X-Request-ID)": "",
  "User-Agent": "claude-cli/2.1.172 (external, cli)"
}
```

#### 完整配置示例

```json
{
  "regex:^(X-Trace-|X-Span-|X-Request-)": "",
  "User-Agent": "claude-cli/2.1.172 (external, cli)",
  "Authorization": "Bearer {api_key}",
  "X-Request-Source": "new-api-gateway"
}
```

---

## 相关文档

- [请求头透传指南.md](./请求头透传指南.md) - 完整的请求头透传配置文档
- [CLAUDE.md](./CLAUDE.md) - 项目约定和规范
- [渠道配置指南](https://github.com/QuantumNous/new-api/wiki) - 官方 Wiki

---

## 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-06-16 | 1.0 | 初始版本，记录 User-Agent 转发问题排查过程和解决方案 |

---

## 贡献者

- **排查人员**：peakchao
- **技术支持**：Claude Code (Opus 4.8)

---

**文档状态**：✅ 已验证  
**适用版本**：new-api v1.0+  
**最后更新**：2026-06-16
