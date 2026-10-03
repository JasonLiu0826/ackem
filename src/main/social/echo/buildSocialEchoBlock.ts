export function buildSocialEchoBlock(items:string[]){return items.length?`【社会见闻】\n${items.slice(-20).map(x=>`- ${x}`).join('\n')}`:''}
