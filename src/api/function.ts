/**
 * 合并直播源列表：保留分组、全局URL去重、同名地址#拼接
 * @param txtContent 原始直播源文本
 * @returns 处理后文本
 */
export function mergeLiveSourceList(txtContent: string): string {
  const lines = txtContent
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const globalUsedUrl = new Set<string>();
  const output: string[] = [];

  for (const line of lines) {
    const [part1, part2] = line.split(',').map(s => s.trim());

    // 分组标题直接加入结果
    if (part2 === '#genre#') {
      output.push(line);
      continue;
    }

    const channelName = part1;
    const url = part2;

    // 重复地址直接跳过
    if (globalUsedUrl.has(url)) continue;
    globalUsedUrl.add(url);

    // 合并当前分组内同名频道地址
    const lastItem = output[output.length - 1];
    if (lastItem && !lastItem.includes('#genre#') && lastItem.startsWith(`${channelName},`)) {
      const [_, existUrls] = lastItem.split(',');
      output[output.length - 1] = `${channelName},${existUrls}#${url}`;
    } else {
      output.push(`${channelName},${url}`);
    }
  }

  return output.join('\n');
}
