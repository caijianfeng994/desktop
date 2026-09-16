# 最终审查修复报告

## 结论

最终审查列出的四项必须修复均已落实，五步流程、技能目录、route 语义和依赖集合未改动。修复提交为 `592eba8`。

## 修复项

1. 空工程字段按“缺失”处理
   - 尺寸、质量、位姿留空时写入 `null`，不会标红，也不会阻止保存或导出。
   - 仅非空但格式错误、尺寸或质量小于等于零、关节零轴会阻止当前请求。
   - 新增静态前端契约断言和真实 HTTP 回归：带配件且工程字段全空时仍请求 `/api/assembly/design-export`，返回 `provisional`。

2. 工程表单变更使旧 manifest 失效
   - 工程表单变更或应用时统一清空 `state.manifest`、`state.urdf` 和 Blob 下载链接，并将 `designStatus` 降为 `provisional`。
   - 手动保存只保存当前表单对应的 `provisional` 状态。
   - 只有刚成功导出的 manifest 可以升为 `ready`；ready 草稿回写不再二次应用表单而误用旧 manifest。

3. 主控支持实例级 `PhysicalSpec`
   - `HardwareAssembly` 新增 `board_physical_override: PhysicalSpec | None`。
   - `design_export` 将主控实例覆盖叠加到 catalog 或自定义主控的 `physical` 默认值。
   - 工程页新增主控表单，并统一支持尺寸、质量、`cad_query`、`cad_source_url`、`step_path`、`mesh_path`、`mesh_units`、`source`、`confidence`。
   - Python 测试覆盖主控覆盖值、catalog 默认值保留和 ready 导出。

4. 中文机器人名称生成稳定且互异的标识
   - ASCII 名称继续使用原有 slug 行为。
   - 纯非 ASCII 名称使用 SHA-256 前 8 位生成 `robot_<8位哈希>`。
   - 测试覆盖确定性、不同中文名互异，以及 manifest 与 URDF 名称一致。

## RED / GREEN

- RED：`python -m pytest tests/test_design_export.py tests/test_hardware_http_api.py -q`
  - 结果：`5 failed, 21 passed`
  - 失败原因分别对应主控覆盖未生效、中文名折叠为 `part`、主控 UI 缺失、空字段被判非法、旧导出未失效。
- GREEN：`python -m pytest tests/test_design_export.py tests/test_hardware_http_api.py -q`
  - 结果：`26 passed`

## 完整验证

- `python -m pytest -q`
  - 结果：`96 passed in 5.90s`
- `python -m compileall -q src tests`
  - 结果：成功，退出码 0
- `python -c 'from pathlib import Path; h=Path("src/desktop_robot/studio/static/design.html").read_text(); print(h.split("<script>",1)[1].split("</script>",1)[0])' | node --check`
  - 结果：成功，退出码 0
- `git diff --check`
  - 结果：成功，退出码 0
- IDE 静态诊断
  - 结果：修改文件无诊断错误

## 护照硬件整份替换判定

不改为按组件 `id` 合并。`POST /api/robot/<id>/hardware` 的请求体是完整 `HardwareAssembly`，工程页加载并提交完整 `components`；因此该列表是权威集合。继续使用 `passport.hardware = assembly` 才能表达删除组件。按 `id` 合并会把客户端已删除的旧组件重新保留，破坏完整替换契约。

## 顾虑

- 当前仓库没有浏览器 E2E 基础设施。前端空字段与失效逻辑使用现有栈的可执行静态契约测试覆盖，并用真实 HTTP 测试验证全空工程数据能够导出 `provisional`；尚未在真实浏览器自动化环境中模拟点击流程。
