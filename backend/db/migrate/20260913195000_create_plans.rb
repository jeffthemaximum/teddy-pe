class CreatePlans < ActiveRecord::Migration[8.0]
  def change
    create_table :month_plans do |t|
      t.references :program_year, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.string :month, null: false
      t.string :label, null: false
      t.string :range_display, null: false
      t.timestamps
    end
    add_index :month_plans, %i[program_year_id month], unique: true

    create_table :weeks do |t|
      t.references :month_plan, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.integer :number, null: false
      t.integer :position_in_block, null: false
      t.string :theme, null: false
      t.string :dates_display, null: false
      t.text :targets, array: true, null: false, default: []
      t.text :challenge, null: false
      t.boolean :trials, null: false, default: false
      t.timestamps
    end
    add_index :weeks, %i[month_plan_id number], unique: true

    create_table :day_cards do |t|
      t.references :week, null: false, foreign_key: true
      t.references :day_role, foreign_key: true
      t.date :date, null: false
      t.string :dow, null: false
      t.string :name, null: false
      t.string :minutes, null: false
      t.integer :intensity, null: false
      t.integer :hie, null: false, default: 0
      t.text :summary_lines, array: true, null: false, default: []
      t.text :dad_note
      t.string :drill_slugs, array: true, null: false, default: []
      t.integer :position, null: false
      t.timestamps
    end
    add_index :day_cards, %i[week_id date], unique: true

    create_table :day_blocks do |t|
      t.references :day_card, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :minutes, null: false
      t.string :name, null: false
      t.text :body
      t.string :tag
      t.jsonb :name_tokens, null: false, default: []
      t.jsonb :body_tokens, null: false, default: []
      t.string :drill_slugs, array: true, null: false, default: []
      t.timestamps
    end
    add_index :day_blocks, %i[day_card_id position], unique: true
    add_check_constraint :day_blocks, "tag is null or tag in ('test','challenge')",
      name: "day_blocks_tag_check"
  end
end
