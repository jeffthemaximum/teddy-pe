class CreateAwards < ActiveRecord::Migration[8.0]
  def change
    create_table :patch_awards do |t|
      t.references :athlete, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.references :patch, null: false, foreign_key: true
      t.date :awarded_on, null: false
      t.text :note
      t.timestamps
    end
    add_index :patch_awards, %i[athlete_id patch_id], unique: true

    create_table :rank_awards do |t|
      t.references :athlete, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.references :block, null: false, foreign_key: true
      t.date :awarded_on, null: false
      t.integer :patch_count, null: false
      t.timestamps
    end
    add_index :rank_awards, %i[athlete_id block_id], unique: true
    # Seven of nine. Two lagging areas never block progress, three do.
    add_check_constraint :rank_awards, "patch_count >= 7", name: "rank_awards_seven_of_nine_check"
  end
end
