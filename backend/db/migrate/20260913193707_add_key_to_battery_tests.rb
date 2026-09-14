class AddKeyToBatteryTests < ActiveRecord::Migration[8.0]
  # The same map the converter writes battery_test_key from. Names are prose
  # and get reworded; this backfill sets every existing row to the key its
  # current name means, once, before the column is ever load-bearing.
  BATTERY_KEYS = {
    "20m sprint"               => "sprint_20m",
    "Standing broad jump"      => "broad_jump",
    "Single-leg hop, each leg" => "single_leg_hop",
    "Overhand throw, each arm" => "overhand_throw",
    "Dead hang"                => "dead_hang",
    "Line-touch agility"       => "line_touch",
    "Jump rope singles"        => "jump_rope",
    "Tennis rally count"       => "rally_count",
    "Basketball cone weave"    => "cone_weave",
    "Soccer wall passes"       => "wall_passes"
  }.freeze

  def change
    # Keying on name was a real improvement on keying on file position, but a
    # test name is prose in a project whose own style rules invite editing
    # prose for tone. A rename would leave a silently orphaned row. Blocks
    # have a key, areas and athletes have a slug, and battery tests get one
    # too, written out explicitly rather than derived from the name, which
    # would defeat the point.
    add_column :battery_tests, :key, :string

    up_only do
      # Backfill every existing row from its current name. This must not
      # hand two rows in the same program year the same key before the
      # unique index goes on: the map is a bijection onto the ten test
      # names, so two rows only collide here if they already share a name,
      # which the index this migration replaces already forbade.
      BATTERY_KEYS.each do |name, key|
        execute <<~SQL
          update battery_tests set key = #{connection.quote(key)}
           where name = #{connection.quote(name)} and key is null
        SQL
      end
    end

    change_column_null :battery_tests, :key, false
    remove_index :battery_tests, %i[program_year_id name], unique: true,
                 name: "index_battery_tests_on_year_and_name"
    add_index :battery_tests, %i[program_year_id key], unique: true,
              name: "index_battery_tests_on_year_and_key"
  end
end
