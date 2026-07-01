"""测试 type=48 (微信位置消息) 解析与渲染。

5 个 fixture **全部合成**，无任何真实地理 / 商户 / 行政区划信息。设计原则：保留
真实 schema 的字段形态 (attr 顺序、占位符、空字符串、enum 漂移、多段 category)，
但 POI 名 / 地址 / 城市名 / phone / 坐标全部用合成占位符。fixture 的能力是验证
解析与渲染逻辑，无需绑定任何具体真实数据。

覆盖 5 种 schema 形态：

  A: 全字段 new schema (有 poiCategoryTips/poiPhone/adcode/cityname, label 空)
  B: 带 infourl 占位的 mid schema (infourl 出现但全 corpus 0% 非空, label 空)
  C: qqmap_ poiid 变体 + buildingId/floorName 实际填了的稀有 case (poiname+label 都填)
  D: 极简 old schema + poiname="[位置]" 占位符 (用户手扔图钉，必须 fallback 到 label)
  E: maptype="0" + 三段 poiCategoryTips + adcode/cityname 都空
"""
import unittest

from mcp_server import (
    _extract_location_info,
    _format_location_text,
    _is_location_poiname_placeholder,
)


FIXTURE_A = '''<?xml version="1.0"?>
<msg>
\t<location x="0.000000" y="0.000000" scale="15" label="" maptype="roadmap" poiname="示例POI-A" poiid="nearby_000000000000000000" buildingId="" floorName="" poiCategoryTips="示例主类A:示例子类" poiBusinessHour="" poiPhone="0000-00000000" poiPriceTips="" isFromPoiList="false" adcode="000000" cityname="城市A" />
</msg>'''

FIXTURE_B = '''<msg><location x="0.000000" y="0.000000" scale="15.010000" label="" poiname="示例POI-B" poiCategoryTips="示例主类B:示例子类" poiBusinessHour="" poiPhone="0000-00000000" poiPriceTips="" maptype="roadmap" infourl="" cityname="城市B" adcode="000001" fromusername="" poiid="nearby_000000000000000000" buildingId="" floorName="" isFromPoiList="0"/></msg>'''

FIXTURE_C = '''<?xml version="1.0"?>
<msg>
\t<location x="0.000000" y="0.000000" scale="16" label="示例市示例区示例路 1 号示例楼 L5" maptype="roadmap" poiname="示例POI-C" poiid="qqmap_000000000000000000" buildingId="000000000000" floorName="L5" poiCategoryTips="示例主类C:示例子类" poiBusinessHour="00:00-24:00" poiPhone="0000-00000000" poiPriceTips="100" isFromPoiList="true" adcode="000000" cityname="城市A" />
</msg>'''

FIXTURE_D = '''<msg>
\t<location x="0.000000" y="0.000000" scale="16" label="示例区(近示例公交站)" maptype="roadmap" poiname="[位置]" fromusername="wxid_test01" />
</msg>'''

FIXTURE_E = '''<msg>
\t<location x="0.000000" y="0.000000" scale="15" label="示例市示例区示例路 2 号" maptype="0" poiname="示例POI-E" poiid="qqmap_000000000000000000" buildingId="" floorName="" poiCategoryTips="示例主类E:示例子类:示例孙类" poiBusinessHour="00:00-12:00;13:00-24:00" poiPhone="0000-00000000" poiPriceTips="50.0" isFromPoiList="true" adcode="" cityname="" fromusername="wxid_test01" />
</msg>'''


class FormatLocationRenderTests(unittest.TestCase):
    """单行 chat-history 渲染：只挑 category / poiname / label 三个信号。"""

    def test_a_full_schema_label_empty(self):
        # label 空 → 渲染只用 category + poiname，不带 @ 地址段
        self.assertEqual(_format_location_text(FIXTURE_A), '[位置·示例主类A] 示例POI-A')

    def test_b_mid_schema_with_empty_infourl(self):
        # infourl 是 schema 占位符，不影响渲染
        self.assertEqual(_format_location_text(FIXTURE_B), '[位置·示例主类B] 示例POI-B')

    def test_c_full_schema_with_address(self):
        # poiname 与 label 都填，label 是地址 → 用 "@ 地址" 拼接
        self.assertEqual(
            _format_location_text(FIXTURE_C),
            '[位置·示例主类C] 示例POI-C @ 示例市示例区示例路 1 号示例楼 L5'
        )

    def test_d_placeholder_poiname_falls_back_to_label(self):
        # poiname="[位置]" 是手扔图钉时客户端填的占位符，必须用 label 渲染
        self.assertEqual(_format_location_text(FIXTURE_D), '[位置] 示例区(近示例公交站)')

    def test_e_maptype_zero_still_renders(self):
        # maptype="0" 是另一种 enum，不影响渲染选择；poiCategoryTips 有多层（主:子:孙）
        # 取顶层主类
        self.assertEqual(
            _format_location_text(FIXTURE_E),
            '[位置·示例主类E] 示例POI-E @ 示例市示例区示例路 2 号'
        )

    def test_minimal_no_poiname_no_label(self):
        # 极端兜底：poiname 与 label 都缺，不堆 lat/lng 数字
        xml = '<msg><location x="0.0" y="0.0" scale="15" label="" poiname="" maptype="roadmap" /></msg>'
        self.assertEqual(_format_location_text(xml), '[位置]')

    def test_no_category(self):
        # poiCategoryTips 缺失 → 渲染前缀退到 [位置] (不带 ·xxx)
        xml = '<msg><location x="0.0" y="0.0" scale="15" label="" poiname="示例POI-X" maptype="roadmap" /></msg>'
        self.assertEqual(_format_location_text(xml), '[位置] 示例POI-X')

    def test_missing_location_node(self):
        # <msg> 内没有 <location> → None, caller 退到 "[位置]" 兜底
        self.assertIsNone(_format_location_text('<msg></msg>'))

    def test_invalid_xml(self):
        self.assertIsNone(_format_location_text(''))
        self.assertIsNone(_format_location_text('not xml at all'))


class ExtractLocationInfoTests(unittest.TestCase):
    """结构化层：decode_location 拿全字段，字段语义边界检查。"""

    def test_a_all_user_shared_fields_extracted(self):
        info = _extract_location_info(FIXTURE_A)
        self.assertEqual(info['poiname'], '示例POI-A')
        self.assertEqual(info['poiid'], 'nearby_000000000000000000')
        self.assertEqual(info['poiCategoryTips'], '示例主类A:示例子类')
        self.assertEqual(info['category_top'], '示例主类A')
        self.assertEqual(info['poiPhone'], '0000-00000000')
        self.assertEqual(info['cityname'], '城市A')
        self.assertEqual(info['adcode'], '000000')
        self.assertEqual(info['isFromPoiList'], 'false')
        # 经纬度：x→lat, y→lng
        self.assertAlmostEqual(info['lat'], 0.0, places=4)
        self.assertAlmostEqual(info['lng'], 0.0, places=4)
        # defensive 字段：empty in fixture A but present in dict
        self.assertEqual(info['infourl'], '')
        self.assertEqual(info['floorName'], '')

    def test_b_empty_infourl_preserved_in_structured_layer(self):
        # infourl 在本 corpus 全部空字符串，但 decode_location 仍要暴露 schema slot
        info = _extract_location_info(FIXTURE_B)
        self.assertEqual(info['infourl'], '')
        self.assertEqual(info['poiCategoryTips'], '示例主类B:示例子类')
        self.assertEqual(info['category_top'], '示例主类B')

    def test_c_rare_building_floor_filled(self):
        # buildingId 和 floorName 在 corpus 里只有 ~1% 非空，但 C 是稀有真实案例
        info = _extract_location_info(FIXTURE_C)
        self.assertEqual(info['buildingId'], '000000000000')
        self.assertEqual(info['floorName'], 'L5')
        self.assertEqual(info['poiBusinessHour'], '00:00-24:00')
        self.assertEqual(info['poiPriceTips'], '100')
        self.assertEqual(info['poiid'], 'qqmap_000000000000000000')

    def test_d_dropped_pin_minimal(self):
        info = _extract_location_info(FIXTURE_D)
        self.assertEqual(info['poiname'], '[位置]')
        self.assertEqual(info['label'], '示例区(近示例公交站)')
        # 字段缺失 → 空串（跟 _extract_transfer_info 风格一致）
        self.assertEqual(info['poiCategoryTips'], '')
        self.assertEqual(info['poiPhone'], '')
        self.assertEqual(info['poiid'], '')

    def test_e_multi_segment_category(self):
        # 三段 "主:子:孙" → category_top 仍只取主类
        info = _extract_location_info(FIXTURE_E)
        self.assertEqual(info['poiCategoryTips'], '示例主类E:示例子类:示例孙类')
        self.assertEqual(info['category_top'], '示例主类E')

    def test_missing_location_node_returns_none(self):
        self.assertIsNone(_extract_location_info('<msg></msg>'))
        self.assertIsNone(_extract_location_info('<msg><other/></msg>'))

    def test_invalid_coordinates_become_none(self):
        xml = '<msg><location x="" y="abc" scale="15" label="x" poiname="y" /></msg>'
        info = _extract_location_info(xml)
        self.assertIsNone(info['lat'])
        self.assertIsNone(info['lng'])


class PlaceholderDetectionTests(unittest.TestCase):

    def test_recognized_placeholders(self):
        self.assertTrue(_is_location_poiname_placeholder('[位置]'))
        self.assertTrue(_is_location_poiname_placeholder('[Location]'))
        self.assertTrue(_is_location_poiname_placeholder('[]'))
        self.assertTrue(_is_location_poiname_placeholder(''))

    def test_real_poi_names_not_placeholder(self):
        self.assertFalse(_is_location_poiname_placeholder('示例POI-A'))
        self.assertFalse(_is_location_poiname_placeholder('示例POI-B'))
        # 中括号在 POI 名中间不算占位符
        self.assertFalse(_is_location_poiname_placeholder('示例POI [子]总店'))


if __name__ == '__main__':
    unittest.main()
