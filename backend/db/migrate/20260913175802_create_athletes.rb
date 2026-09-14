class CreateAthletes < ActiveRecord::Migration[8.0]
  def change
    create_table :athletes do |t|
      t.string :name, null: false
      t.date :birthday, null: false
      # Nullable so an athlete can exist before they have a login, and so a
      # second child needs no migration.
      t.references :user, foreign_key: true, index: { unique: true }
      t.timestamps
    end
  end
end
