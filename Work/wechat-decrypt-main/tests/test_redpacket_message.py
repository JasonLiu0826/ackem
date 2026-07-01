"""测试 appmsg type=2001（微信红包）解析与渲染。

此前独立红包消息走 _format_app_message_text 的 generic 分支，渲染成无信息的
`[链接/文件]`，丢掉 scenetext（场景）/ sendertitle（祝福语）/ 发红包人。本组用例
钉住新行为：紧凑的 `[红包·<场景>] <祝福语> (发自 <wxid>)` 一行。

fixture 全部合成，无任何真实 wxid / 昵称 / 金额 / id。

金额：标准微信红包的消息 XML 不含金额字段（金额在领取后才可见，不写进消息），
仅「群收款」/「活动账单」在 <senderdes> 带人均额。由 test_*_amount 用例钉住。

发红包人：wxid 藏在领取链接 <nativeurl> 的 sendusername= 参数里。
"""
import unittest
import xml.etree.ElementTree as ET

import mcp_server


def _appmsg(inner):
    return ET.fromstring(f'<appmsg>{inner}</appmsg>')


class FormatRedpacketTextTests(unittest.TestCase):
    def test_standard_redpacket_scene_and_greeting(self):
        appmsg = _appmsg(
            '<title>微信红包</title>'
            '<wcpayinfo><scenetext>微信红包</scenetext>'
            '<sendertitle>恭喜发财，大吉大利</sendertitle>'
            '<senderdes></senderdes></wcpayinfo>'
        )
        out = mcp_server._format_redpacket_message_text(appmsg, '微信红包')
        self.assertEqual(out, '[红包·微信红包] 恭喜发财，大吉大利')

    def test_standard_redpacket_scene_never_extracts_amount(self):
        # 标准红包 scene 不在 AA 收款集合，senderdes 里的数字不被当人均额提取
        appmsg = _appmsg(
            '<wcpayinfo><scenetext>微信红包</scenetext>'
            '<sendertitle>恭喜发财</sendertitle>'
            '<senderdes>发了一个 8.88 元的红包</senderdes></wcpayinfo>'
        )
        out = mcp_server._format_redpacket_message_text(appmsg, '微信红包')
        self.assertEqual(out, '[红包·微信红包] 恭喜发财')
        self.assertNotIn('8.88', out)

    def test_group_collection_shows_per_person_amount(self):
        appmsg = _appmsg(
            '<wcpayinfo><scenetext>群收款</scenetext>'
            '<sendertitle>聚餐 AA</sendertitle>'
            '<senderdes>每人 138.34 元</senderdes></wcpayinfo>'
        )
        out = mcp_server._format_redpacket_message_text(appmsg, '群收款')
        self.assertEqual(out, '[红包·群收款] 聚餐 AA 人均 138.34 元')

    def test_event_bill_shows_per_person_amount(self):
        appmsg = _appmsg(
            '<wcpayinfo><scenetext>活动账单</scenetext>'
            '<senderdes>人均 50 元</senderdes></wcpayinfo>'
        )
        out = mcp_server._format_redpacket_message_text(appmsg, '活动账单')
        self.assertEqual(out, '[红包·活动账单] 人均 50 元')

    def test_sender_wxid_appended_from_nativeurl(self):
        # 发红包人 wxid 从领取链接 nativeurl 的 sendusername= 提取，接在末尾
        appmsg = _appmsg(
            '<wcpayinfo><scenetext>微信红包</scenetext>'
            '<sendertitle>恭喜发财</sendertitle>'
            '<nativeurl>wxpay://c2cbizmessagehandler/hongbao/receivehongbao?'
            'msgtype=1&amp;sendid=synth&amp;sendusername=wxid_synth_sender&amp;ver=6</nativeurl>'
            '</wcpayinfo>'
        )
        out = mcp_server._format_redpacket_message_text(appmsg, 't')
        self.assertEqual(out, '[红包·微信红包] 恭喜发财 (发自 wxid_synth_sender)')

    def test_no_scene_falls_back_to_bare_label(self):
        appmsg = _appmsg('<wcpayinfo><sendertitle>恭喜发财</sendertitle></wcpayinfo>')
        out = mcp_server._format_redpacket_message_text(appmsg, 'ignored')
        self.assertEqual(out, '[红包] 恭喜发财')

    def test_missing_wcpayinfo_falls_back_to_title(self):
        appmsg = _appmsg('<title>微信红包</title>')
        out = mcp_server._format_redpacket_message_text(appmsg, '微信红包')
        self.assertEqual(out, '[红包] 微信红包')

    def test_missing_wcpayinfo_no_title_bare_label(self):
        appmsg = _appmsg('<des>x</des>')
        self.assertEqual(mcp_server._format_redpacket_message_text(appmsg, ''), '[红包]')

    def test_type2001_dispatches_to_helper(self):
        # _format_app_message_text 的 type=2001 分支必须走 _format_redpacket_message_text，
        # 不再掉进 generic [链接/文件] 兜底。
        content = (
            '<msg><appmsg><type>2001</type><title>微信红包</title>'
            '<wcpayinfo><scenetext>微信红包</scenetext>'
            '<sendertitle>恭喜发财</sendertitle>'
            '<nativeurl>wxpay://hongbao?sendusername=wxid_synth_sender&amp;ver=6</nativeurl>'
            '</wcpayinfo></appmsg></msg>'
        )
        out = mcp_server._format_app_message_text(
            content, local_type=49, is_group=False,
            chat_username='wxid_synth_a', chat_display_name='Sender A', names={},
        )
        self.assertEqual(out, '[红包·微信红包] 恭喜发财 (发自 wxid_synth_sender)')
        self.assertNotIn('链接/文件', out)


if __name__ == '__main__':
    unittest.main()
