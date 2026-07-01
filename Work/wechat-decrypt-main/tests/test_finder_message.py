"""测试 appmsg type=51（视频号分享）解析与渲染。

此前独立视频号分享走 _format_app_message_text 的 generic 分支，渲染成无信息的
`[链接/文件]`；而同一条视频号被引用回复嵌套时反而有 [视频号] 标签，两条路径
体验不一致。本组用例钉住新行为：`[视频号] <昵称>: <简介>` 一行。

fixture 全部合成，无任何真实视频号昵称 / 简介 / id。
"""
import unittest
import xml.etree.ElementTree as ET

import mcp_server


def _appmsg(inner):
    return ET.fromstring(f'<appmsg>{inner}</appmsg>')


class FormatFinderTextTests(unittest.TestCase):
    def test_nickname_and_desc(self):
        appmsg = _appmsg(
            '<title>示例标题</title>'
            '<finderFeed><nickname>示例视频号</nickname>'
            '<desc>这是一条示例视频简介</desc></finderFeed>'
        )
        out = mcp_server._format_finder_message_text(appmsg, '示例标题')
        self.assertEqual(out, '[视频号] 示例视频号: 这是一条示例视频简介')

    def test_nickname_only(self):
        appmsg = _appmsg('<finderFeed><nickname>示例视频号</nickname></finderFeed>')
        out = mcp_server._format_finder_message_text(appmsg, 'ignored')
        self.assertEqual(out, '[视频号] 示例视频号')

    def test_desc_truncated_to_80_chars(self):
        long_desc = '甲' * 100
        appmsg = _appmsg(
            f'<finderFeed><nickname>N</nickname><desc>{long_desc}</desc></finderFeed>'
        )
        out = mcp_server._format_finder_message_text(appmsg, 't')
        self.assertEqual(out, '[视频号] N: ' + '甲' * 80)

    def test_missing_nickname_falls_back_to_title(self):
        appmsg = _appmsg('<finderFeed><desc>无昵称</desc></finderFeed>')
        out = mcp_server._format_finder_message_text(appmsg, '示例标题')
        self.assertEqual(out, '[视频号] 示例标题')

    def test_missing_finderfeed_and_title_bare_label(self):
        appmsg = _appmsg('<des>x</des>')
        self.assertEqual(mcp_server._format_finder_message_text(appmsg, ''), '[视频号]')

    def test_type51_dispatches_to_helper(self):
        # _format_app_message_text 的 type=51 分支必须走 _format_finder_message_text，
        # 不再掉进 generic [链接/文件] 兜底。
        content = (
            '<msg><appmsg><type>51</type><title>示例标题</title>'
            '<finderFeed><nickname>示例视频号</nickname>'
            '<desc>示例简介</desc></finderFeed></appmsg></msg>'
        )
        out = mcp_server._format_app_message_text(
            content, local_type=49, is_group=False,
            chat_username='wxid_synth_a', chat_display_name='Sender A', names={},
        )
        self.assertEqual(out, '[视频号] 示例视频号: 示例简介')
        self.assertNotIn('链接/文件', out)


if __name__ == '__main__':
    unittest.main()
