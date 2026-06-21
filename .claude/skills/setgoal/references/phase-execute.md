# Phase B: 执行任务

## 执行规范

### 最小化修改原则

只修改实现当前 criteria 需要的代码，不添加额外功能。

### 执行步骤

1. **读取相关代码** — 理解当前实现
2. **制定修改计划** — 明确要改什么、为什么
3. **执行修改** — 最小化改动
4. **运行构建** — `npm run build` 或相关构建命令
5. **运行类型检查** — `npm run typecheck`
6. **运行安全扫描** — 检查是否有真实 token/key/secret

### 构建命令参考

```bash
# 标准构建验证
npm run build
npm run typecheck

# 生成的应用验证
bash worker/verify-build.sh apps/{name}/v{n}/

# 安全扫描（检查是否有硬编码的 token/key）
rg "(ghp_|gho_|github_pat_|sk-|AKIA|AIza|eyJ)" \
  --type-add 'code:*.{ts,js,vue,json,yml,yaml,sh,env}' \
  -g '!*.md' \
  src/ apps/ worker/ .github/ || echo "SECURITY_SCAN: PASS"
```

### 密码/敏感信息处理规则

**开发中涉及的密码必须脱敏：**

| 场景 | 处理方式 |
|------|---------|
| 日志输出 | `password: ***` |
| 错误信息 | 不包含原始密码 |
| UI 展示 | 掩码显示（如 `***@***.***`） |
| 配置文件 | 使用环境变量，不硬编码 |
| 测试用例 | 使用 mock 值，不包含真实凭证 |

### 常见坑（参考 `docs/retrospectives/`）

- CI 环境不传递 `.env` 变量 — 使用 `process.env` fallback
- Vite `base` 路径错误 — 平台用 `/`，生成应用用 `./`
- OAuth code exchange 必须在 `authStore.init()` 中，不在 UI 组件中

## 执行输出格式

```
Phase B 执行结果：
- 修改文件: <file1>, <file2>
- 修改内容: <简要描述>
- 构建状态: PASS/FAIL
- 如有失败: <错误信息>
```
