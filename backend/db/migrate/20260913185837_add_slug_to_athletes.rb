class AddSlugToAthletes < ActiveRecord::Migration[8.0]
  def change
    # The seeder needs a key that does not move when a display name is
    # corrected. Keying on the name orphaned the athlete row and everything
    # hanging off it the first time somebody fixed a typo.
    add_column :athletes, :slug, :string
    up_only { execute "update athletes set slug = 'teddy' where slug is null" }
    change_column_null :athletes, :slug, false
    add_index :athletes, :slug, unique: true

    add_index :ball_gates, %i[program_year_id from_ball to_ball], unique: true,
              name: "index_ball_gates_on_year_and_progression"
  end
end
