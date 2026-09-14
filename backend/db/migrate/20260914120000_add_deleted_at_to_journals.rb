class AddDeletedAtToJournals < ActiveRecord::Migration[8.0]
  # Jeff's ruling: he and Teddy can each delete their own entries, and a
  # delete stamps this column rather than removing the row. The row keeps
  # every word. Recovery is a console, and it is Jeff's.
  #
  # The unique index has to become partial or the promise breaks. It reads
  # (user_id, program_year_id, session_date), which is the same triple
  # upsert_for addresses an entry by, so a deleted entry would still occupy
  # its day: Teddy deletes what he wrote on the 17th, writes something new
  # about the 17th, and either the insert violates the index or the upsert
  # finds the deleted row and overwrites the words it was supposed to keep.
  # Partial on deleted_at IS NULL, the day is free again and the deleted row
  # keeps everything it said.
  #
  # That same partial index is the one the scope reads through
  # (deleted_at IS NULL, then user and year), so deleted_at gets no separate
  # index of its own.
  def up
    add_column :athlete_entries, :deleted_at, :datetime
    add_column :coach_entries, :deleted_at, :datetime

    remove_index :athlete_entries, name: "index_athlete_entries_on_author_year_and_date"
    add_index :athlete_entries, %i[user_id program_year_id session_date], unique: true,
              where: "deleted_at IS NULL",
              name: "index_athlete_entries_on_author_year_and_date"

    remove_index :coach_entries, name: "index_coach_entries_on_author_year_and_date"
    add_index :coach_entries, %i[user_id program_year_id session_date], unique: true,
              where: "deleted_at IS NULL",
              name: "index_coach_entries_on_author_year_and_date"
  end

  def down
    # Going back means the column is gone, so a row that was deleted becomes
    # visible again and can collide on the full unique index below. Nothing
    # here guesses which of two rows for one day should survive: rolling this
    # back with deleted entries in the table is a decision for whoever is
    # doing it, at a console, not a side effect of a migration.
    remove_index :athlete_entries, name: "index_athlete_entries_on_author_year_and_date"
    add_index :athlete_entries, %i[user_id program_year_id session_date], unique: true,
              name: "index_athlete_entries_on_author_year_and_date"

    remove_index :coach_entries, name: "index_coach_entries_on_author_year_and_date"
    add_index :coach_entries, %i[user_id program_year_id session_date], unique: true,
              name: "index_coach_entries_on_author_year_and_date"

    remove_column :athlete_entries, :deleted_at
    remove_column :coach_entries, :deleted_at
  end
end
