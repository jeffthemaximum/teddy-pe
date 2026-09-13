class CreateProgramStructure < ActiveRecord::Migration[8.0]
  def change
    drop_table :program_years, if_exists: true

    create_table :program_years do |t|
      t.references :athlete, null: false, foreign_key: true
      t.string :label, null: false
      t.date :starts_on, null: false
      t.date :ends_on, null: false
      t.string :status, null: false, default: "draft"
      t.string :ball_now, null: false
      t.text :rank_rule
      t.text :north_star
      t.timestamps
    end
    add_index :program_years, %i[athlete_id label], unique: true

    create_table :blocks do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :key, null: false
      t.string :name, null: false
      t.integer :position, null: false
      t.date :starts_on, null: false
      t.date :ends_on, null: false
      t.text :focus
      t.timestamps
    end
    add_index :blocks, %i[program_year_id key], unique: true
    add_index :blocks, %i[program_year_id position], unique: true

    create_table :areas do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :slug, null: false
      t.integer :position, null: false
      t.string :name, null: false
      t.text :summary
      t.timestamps
    end
    add_index :areas, %i[program_year_id slug], unique: true

    create_table :area_cells do |t|
      t.references :area, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.text :body, null: false
      t.timestamps
    end
    add_index :area_cells, %i[area_id block_id], unique: true

    create_table :patches do |t|
      t.references :program_year, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.references :area, null: false, foreign_key: true
      t.string :name, null: false
      t.text :requirement, null: false
      t.timestamps
    end
    add_index :patches, %i[block_id area_id], unique: true

    # No date column anywhere on this table. The gates move on skill.
    create_table :ball_gates do |t|
      t.references :program_year, null: false, foreign_key: true
      t.integer :position, null: false
      t.string :from_ball, null: false
      t.string :to_ball, null: false
      t.string :label, null: false
      t.text :requirement, null: false
      t.string :status, null: false
      t.timestamps
    end
    add_index :ball_gates, %i[program_year_id position], unique: true

    create_table :test_dates do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :window, null: false
      t.string :label, null: false
      t.string :display, null: false
      t.integer :position, null: false
      t.timestamps
    end
    add_index :test_dates, %i[program_year_id window], unique: true

    create_table :day_roles do |t|
      t.references :program_year, null: false, foreign_key: true
      t.string :dow, null: false
      t.integer :position, null: false
      t.string :name, null: false
      t.string :organized, array: true, null: false, default: []
      t.string :minutes, null: false
      t.integer :intensity, null: false
      t.text :note
      t.timestamps
    end
    add_index :day_roles, %i[program_year_id dow], unique: true
  end
end
