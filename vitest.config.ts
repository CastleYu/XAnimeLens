import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 本地 agent 工作树与临时目录里可能有整份仓库副本，不重复执行
    exclude: [...configDefaults.exclude, '.claude/**', 'Temp/**', 'dist/**'],
  },
});
