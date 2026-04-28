# 拼豆 Pindou

把照片转成 MARD 24/48 色拼豆图纸的小工具。一个纯前端 PWA，离线可用，给小朋友拼豆参考。

## 特性

- **图片自动转拼豆图**
  - SLIC 5D 聚类（Lab + xy 空间）+ RGB 桶 mode 选色 + culori deltaE2000 调色板映射
  - 饱和度偏好（chroma 25-30 边界区间）让"卡在边界的色"被推往饱和方向
  - alpha ≥ 220 阈值排除 PNG 抗锯齿杂色（避免边缘出现灰色噪点）
  - 小色块合并后处理保留眼睛、嘴巴等高对比小特征
- **24 / 48 色单选**
- **画板尺寸滑块**（16-64），支持精确数字输入；上传新图后改尺寸自动重渲染（无需重新选文件）
- **画笔 + 颜料桶（4-连通 flood fill） + 橡皮 + 撤销 / 重做 / 清空**
- **3 个本地存档槽**（localStorage）；加载存档自动覆盖该位置，避免改一笔就跑去新位置
- **导出 PNG**：拼豆图 + 完整色卡（每色 code × 颗粒数 + 总计）
- **响应式 layout**：手机竖屏 / iPad 竖屏 / 横屏自适应
- **PWA**：可安装到主屏，断网可用

## 技术栈

React 18 + Vite + TypeScript + culori（色彩计算）+ vite-plugin-pwa

## 算法说明

参考过两篇资料：
- **SLIC**：Gerstner et al. 2012, *Pixelated Image Abstraction*
- **像素艺术 GCD detect**：unfake.js 的 runs-based detection 思路

代码全部 self-implement，不含任何复制的代码，思路参考但不受 copyright 约束。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
# 输出在 dist/，扔到任何静态托管即可
```

## License

MIT

---

**作者**：[豆子狐狸 🦊 douzifox](https://github.com/douzifox)
**合作开发**：Claude（小克 🐾）

整个项目从算法到 UI 由小狐狸主导设计 + 调优，小克写代码 + 抓 bug。一起从最早一个"绒球缺像素"的吐槽，迭代成现在这个完整的 PWA 工具。
