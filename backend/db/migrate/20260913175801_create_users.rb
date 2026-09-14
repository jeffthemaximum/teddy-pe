class CreateUsers < ActiveRecord::Migration[8.0]
  def change
    enable_extension "citext" unless extension_enabled?("citext")

    create_table :users do |t|
      t.citext :email, null: false
      t.string :password_digest, null: false
      t.string :name, null: false
      t.string :role, null: false, default: "viewer"
      t.datetime :last_seen_at
      t.timestamps
    end

    add_index :users, :email, unique: true
    add_check_constraint :users, "role in ('coach','athlete','viewer')", name: "users_role_check"
  end
end
