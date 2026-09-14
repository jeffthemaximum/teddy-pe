# The toggle lives here rather than in the client. An entry Teddy has not
# shared is absent from the coach's payload, not present and hidden.
class AthleteEntryPolicy < ApplicationPolicy
  def index?  = user.coach? || user.athlete?
  def show?   = Scope.new(user, AthleteEntry).resolve.exists?(id: record.id)
  def create? = user.athlete?
  def update? = user.athlete? && record.user_id == user.id

  # Each person deletes only their own, and the line is drawn here rather
  # than by which button a screen happens to render. The coach can read a
  # shared entry, which means the scope hands him the record and this is the
  # only thing standing between him and deleting his son's writing.
  def destroy? = user.athlete? && record.user_id == user.id

  class Scope < Scope
    # `kept` is applied once, above the branches, rather than on each of
    # them. That is the point: this is the single place the API and the week
    # payload both decide what an entry's reader may see, so a deleted entry
    # disappears from both by the same line that already decides sharing,
    # and there is no second filter to drift from this one.
    def resolve
      return scope.none if user.nil?
      readable = scope.kept
      return readable.where(user_id: user.id) if user.athlete?
      return readable.shared_with_coach if user.coach?
      scope.none   # a viewer sees no journal entries from either side
    end
  end
end
