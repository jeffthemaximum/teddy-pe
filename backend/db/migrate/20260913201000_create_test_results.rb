class CreateTestResults < ActiveRecord::Migration[8.0]
  def change
    create_table :test_results do |t|
      t.references :program_year, null: false, foreign_key: true
      t.references :athlete, null: false, foreign_key: true
      t.references :test_date, null: false, foreign_key: true
      t.references :battery_measure, null: false, foreign_key: true
      t.references :recorded_by_user, null: false, foreign_key: { to_table: :users }
      # What was typed, kept as text. Some rows get a range or a unit, and a
      # value that will not parse is still worth storing.
      t.string :raw_value, null: false
      t.decimal :numeric_value, precision: 10, scale: 3
      t.datetime :recorded_at, null: false
      t.timestamps
    end
    add_index :test_results, %i[program_year_id test_date_id battery_measure_id],
              unique: true, name: "index_test_results_on_year_window_and_measure"
  end
end
