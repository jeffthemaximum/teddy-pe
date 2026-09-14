class CreateDrills < ActiveRecord::Migration[8.0]
  def change
    # Global across years, with no program_year_id, so drill mastery carries
    # forward rather than restarting each September.
    create_table :drills do |t|
      t.string :slug, null: false
      t.string :name, null: false
      t.string :area_name, null: false
      t.string :aliases, array: true, null: false, default: []
      t.text :short, null: false
      t.text :how, array: true, null: false, default: []
      t.text :watch
      t.text :cue
      t.string :video
      t.timestamps
    end
    add_index :drills, :slug, unique: true
  end
end
