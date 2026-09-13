class CreateBattery < ActiveRecord::Migration[8.0]
  def change
    create_table :battery_tests do |t|
      t.references :program_year, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :name, null: false
      t.text :protocol, null: false
      t.string :area_name, null: false
      t.string :unit, null: false
      t.timestamps
    end
    # The test is identified by its name, not by where it sits in the file.
    # Ball gates learned this the hard way: position is display order, and a
    # plain unique index on a mutable ordinal both invites the seeder to
    # overwrite the wrong row on reorder and can reject its own transaction
    # mid-swap. The content spec already checks position for repeats.
    add_index :battery_tests, %i[program_year_id name], unique: true,
              name: "index_battery_tests_on_year_and_name"

    create_table :battery_measures do |t|
      t.references :program_year, null: false, foreign_key: true
      # Nullable on purpose. Height and single-leg balance are recordable rows
      # that belong to none of the ten tests.
      t.references :battery_test, foreign_key: true
      t.string :test_id, null: false
      t.integer :position, null: false
      t.string :label, null: false
      t.string :unit, null: false
      t.string :direction, null: false
      t.timestamps
    end
    add_index :battery_measures, %i[program_year_id test_id], unique: true
    add_check_constraint :battery_measures,
      "direction in ('lower','higher','growth')", name: "battery_measures_direction_check"
  end
end
