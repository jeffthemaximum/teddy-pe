namespace :users do
  desc "Create or update a user. EMAIL= NAME= ROLE=coach|athlete|viewer [PASSWORD=]"
  task create: :environment do
    email = ENV.fetch("EMAIL").strip.downcase
    user = User.find_or_initialize_by(email: email)

    # Only assign a password when one is asked for or this is a new account.
    # Running this later to fix a name should not silently rotate credentials.
    rotating_password = ENV["PASSWORD"].present? || user.new_record?
    # Generated and printed once. Nothing is ever committed or seeded.
    password = ENV["PASSWORD"].presence || SecureRandom.alphanumeric(20)

    user.assign_attributes(name: ENV.fetch("NAME"), role: ENV.fetch("ROLE"))
    user.password = password if rotating_password
    user.save!

    puts "#{user.email}  #{user.role}"
    if rotating_password
      puts "password: #{password}"
      puts "Change it after the first sign-in. This is the only time it is shown."
    else
      puts "password unchanged"
    end
  end

  desc "Link a user to the athlete record. EMAIL="
  task link_athlete: :environment do
    user = User.find_by!(email: ENV.fetch("EMAIL").strip.downcase)
    athlete = Athlete.first or abort("No athlete yet. Run content:seed first.")
    athlete.update!(user: user)
    puts "#{athlete.name} is now #{user.email}"
  end
end
