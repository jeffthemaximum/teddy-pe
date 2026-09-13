class CreateJournals < ActiveRecord::Migration[8.0]
  def change
    create_table :coach_entries do |t|
      t.references :user, null: false, foreign_key: true
      t.references :athlete, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.references :day_card, foreign_key: true
      t.date :session_date, null: false
      t.integer :overall
      t.integer :energy
      t.boolean :flag_pain, null: false, default: false
      t.text :pain_note
      t.text :note
      t.string :challenge_num
      t.timestamps
    end
    # One entry per author per year per session date, addressed by construction.
    add_index :coach_entries, %i[user_id program_year_id session_date], unique: true,
              name: "index_coach_entries_on_author_year_and_date"

    create_table :athlete_entries do |t|
      t.references :user, null: false, foreign_key: true
      t.references :athlete, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.references :day_card, foreign_key: true
      t.date :session_date, null: false
      t.integer :felt
      t.text :best
      t.text :hard
      t.text :note
      # Teddy's own switch. Off by default, so showing Dad is a choice he
      # makes rather than something he has to remember to turn off.
      t.boolean :shared, null: false, default: false
      t.timestamps
    end
    add_index :athlete_entries, %i[user_id program_year_id session_date], unique: true,
              name: "index_athlete_entries_on_author_year_and_date"

    # A table rather than the jsonb column the old diary used, because drill
    # mastery has to be queryable across years.
    create_table :drill_ratings do |t|
      t.references :coach_entry, null: false, foreign_key: true
      t.references :drill, null: false, foreign_key: true
      t.references :program_year, null: false, foreign_key: true
      t.date :session_date, null: false
      t.string :rating, null: false
      t.timestamps
    end
    add_index :drill_ratings, %i[coach_entry_id drill_id], unique: true
    add_index :drill_ratings, %i[drill_id session_date]
    add_check_constraint :drill_ratings, "rating in ('not_yet','getting','owns')",
      name: "drill_ratings_rating_check"
  end
end
