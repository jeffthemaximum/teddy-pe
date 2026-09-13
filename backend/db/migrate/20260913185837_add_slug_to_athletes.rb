class AddSlugToAthletes < ActiveRecord::Migration[8.0]
  def change
    # The seeder needs a key that does not move when a display name is
    # corrected. Keying on the name orphaned the athlete row and everything
    # hanging off it the first time somebody fixed a typo.
    add_column :athletes, :slug, :string
    up_only do
      # The oldest athlete is Teddy, who the content keys on. Anyone else gets a
      # slug derived from their id, because this backfill must not hand two rows
      # the same value right before a unique index goes on.
      execute <<~SQL
        update athletes
           set slug = case when id = (select min(id) from athletes) then 'teddy'
                           else 'athlete-' || id end
         where slug is null
      SQL
    end
    change_column_null :athletes, :slug, false
    add_index :athletes, :slug, unique: true

    add_index :ball_gates, %i[program_year_id from_ball to_ball], unique: true,
              name: "index_ball_gates_on_year_and_progression"
  end
end
