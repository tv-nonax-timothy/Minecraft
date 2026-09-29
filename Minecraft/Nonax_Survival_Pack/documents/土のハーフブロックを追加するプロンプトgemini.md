# 役割（ペルソナ）
あなたはゲームクリエイターで統合版MINECRAFTのbehavior_packやresource_packに精通したMinecraftモッド開発者兼アーティストす。

# 背景・目的
統合版のMINECRAFTで土のハーフブロックの不具合を修正します。
`behavior_pack\Nonax_Survival_Pack\blocks\grass_slab.json`と`resource_pack\Nonax_Survival_Pack\models\blocks\grass_slab.json`を確認し不具合修正版を生成してください。
ハーフブロックの`minecraft:geometry`は`resource_pack\Nonax_Survival_Pack\models\blocks\grass_slab.json`を使用します。 `テクスチャの配置`を参照すること。
バイオームによって草の生えた土のハーフブロックは色が変わる仕様です。

# 具体的な指示（タスク）
- 土のハーフブロックを追加する[ビヘイビアーパック][リソースパック]を修正します。
- 認識している不具合
  - ブロックのトップのテクスチャに草の`custom_grass_top`が表示されない。
  - ブロックのトップのテクスチャに半分だけの土のテクスチャが表示されている。おそらく`custom_dirt_side`だと思われる。
- 推測している原因
  - `behavior_pack\Nonax_Survival_Pack\blocks\grass_slab.json`の["*": { "texture": "custom_dirt_side", "render_method": "opaque" },]のテクスチャが表示されているのではないかと感じている。
    - この部分を単純に削除すると、エラーとなりブロック自体が消えてしまう。
# 制約条件
- 既存の[ビヘイビアーパック][リソースパック]の名称は共通で[Nonax_Survival_Pack]を使います。
- "format_version"は "1.21.120"を前提とします。
- `alpha_test`は使用禁止です。

## テクスチャの配置
### ハーフブロックのテクスチャピクセル

凡例:`#` はテクスチャのどの部分を利用するかを示している。
| \ | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 1 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| 8 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |
| 9 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |
| 10 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |
| 11 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |
| 12 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |
| 13 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |
| 14 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |
| 15 | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # | # |

### behavior_pack\Nonax_Survival_Pack\blocks\grass_slab.json
{
  "format_version": "1.21.120",
  "minecraft:block": {
    "description": {
      "identifier": "nonax:grass_slab"
    },
    "components": {
      "minecraft:geometry": "geometry.custom_half_grass_slab",
      "minecraft:material_instances": {
        "*": {
          "texture": "custom_dirt_side",
          "render_method": "opaque"
        },
        "custom_dirt_base": {
          "texture": "custom_dirt_side",
          "render_method": "opaque"
        },
        "custom_dirt_top": {
          "texture": "custom_dirt_top",
          "render_method": "opaque"
        },
        "custom_grass_top": {
          "texture": "custom_grass_top",
          "tint_method": "grass",
          "render_method": "opaque"
        },
        "custom_grass_side": {
          "texture": "custom_grass_side",
          "tint_method": "grass",
          "render_method": "opaque"
        }
      },
      "minecraft:destructible_by_mining": {
        "seconds_to_destroy": 0.5
      },
      "minecraft:collision_box": {
        "origin": [-8, 0, -8],
        "size": [16, 8, 16]
      },
      "minecraft:selection_box": {
        "origin": [-8, 0, -8],
        "size": [16, 8, 16]
      }
    }
  }
}

### resource_pack\Nonax_Survival_Pack\models\blocks\grass_slab.json
{
    "format_version": "1.12.0",
    "minecraft:geometry": [
        {
            "description": {
                "identifier": "geometry.custom_half_grass_slab",
                "texture_width": 16,
                "texture_height": 16,
                "visible_bounds_width": 2,
                "visible_bounds_height": 1.75,
                "visible_bounds_offset": [0, 0.125, 0]
            },
            "bones": [
                {
                    "name": "grass_slab_model",
                    "pivot": [0, 0, 0],
                    "cubes": [
                        {
                            "origin": [-8, 0, -8],
                            "size": [16, 4, 16],
                            "uv": {
                                "north": {"uv": [0, 12], "size": [16, 4], "material": "custom_dirt_base"},
                                "east": {"uv": [0, 12], "size": [16, 4], "material": "custom_dirt_base"},
                                "south": {"uv": [0, 12], "size": [16, 4], "material": "custom_dirt_base"},
                                "west": {"uv": [0, 12], "size": [16, 4], "material": "custom_dirt_base"},
                                "up": {"uv": [0, 0], "size": [16, 16], "material": "custom_dirt_top"},
                                "down": {"uv": [0, 0], "size": [16, 16], "material": "custom_dirt_top"}
                            }
                        },
                        {
                            "origin": [-8, 4, -8],
                            "size": [16, 4, 16],
                            "uv": {
                                "north": {"uv": [0, 8], "size": [16, 4], "material": "custom_grass_side"},
                                "east": {"uv": [0, 8], "size": [16, 4], "material": "custom_grass_side"},
                                "south": {"uv": [0, 8], "size": [16, 4], "material": "custom_grass_side"},
                                "west": {"uv": [0, 8], "size": [16, 4], "material": "custom_grass_side"},
                                "up": {"uv": [0, 0], "size": [16, 16], "material": "custom_grass_top"},
                                "down": {"uv": [0, 0], "size": [16, 16], "material": "custom_dirt_top"}
                            }
                        }
                    ]
                }
            ]
        }
    ]
}

